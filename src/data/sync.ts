import type { CardRecord } from '../analytics/types';
import { mapCard } from '../pipefy/mapCard';
import { ALL_CARDS, type AllCardsResponse, cardsByIdQuery, type RawCard } from '../pipefy/queries';
import type { PipefyClient } from '../pipefy/sdk';
import type { DashboardDb } from './db';

export interface SyncProgress {
  phase: 'idle' | 'full' | 'incremental';
  loaded: number;
  /** Total esperado, quando conhecido (contagem do pipe). */
  expected?: number;
  pages: number;
}

export interface ChangeEntry {
  cardId: string;
  action: string;
  at: string;
}

export interface ChangesResponse {
  changes: ChangeEntry[];
  /** Hora do servidor; vira o próximo `since`, sem depender do relógio do navegador. */
  now: string;
  /** Mudanças demais desde `since`: o app faz uma recarga completa. */
  truncated?: boolean;
}

interface FullLoadState {
  cursor: string | null;
  loaded: number;
  pages: number;
  startedAt: string;
}

const DAY_MS = 86_400_000;
const BATCH_BY_ID = 20;

export interface SyncOptions {
  /** URL do endpoint de mudanças do Worker. Sem ela, o incremental fica só na reconciliação. */
  changesUrl?: string;
  onProgress?: (p: SyncProgress) => void;
  /** Chamado a cada lote gravado, para os gráficos se atualizarem durante a carga. */
  onData?: () => void;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Copia os cards do Pipefy para o cache do usuário e mantém o cache atualizado. */
export class SyncEngine {
  private running: Promise<void> | null = null;

  constructor(
    private client: PipefyClient,
    private db: DashboardDb,
    private opts: SyncOptions = {},
  ) {}

  private now() {
    return (this.opts.now ?? (() => new Date()))();
  }

  private progress(p: SyncProgress) {
    this.opts.onProgress?.(p);
  }

  /** Evita duas sincronizações ao mesmo tempo. */
  private exclusive(task: () => Promise<void>): Promise<void> {
    if (this.running) return this.running;
    this.running = task().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async lastSync(): Promise<string | null> {
    return (await this.db.getMeta<string>('lastSync')) ?? null;
  }

  /** Decide o que fazer ao abrir o painel: carga completa, retomar, reconciliar ou só o incremental. */
  start(expected?: number): Promise<void> {
    return this.exclusive(async () => {
      const pending = await this.db.getMeta<FullLoadState>('fullLoad');
      const lastFull = await this.db.getMeta<string>('lastFullSync');
      if (pending || !lastFull) {
        await this.runFullLoad(expected);
        return;
      }
      try {
        await this.runIncremental();
      } catch (err) {
        // Worker fora do ar não impede a reconciliação nem o uso do cache.
        console.warn('[dashboard] incremental falhou', err);
      }
      if (this.now().getTime() - Date.parse(lastFull) > DAY_MS) await this.runFullLoad(expected);
    });
  }

  /** Recarga completa sob demanda (botão "Atualizar tudo"). */
  reloadAll(expected?: number): Promise<void> {
    return this.exclusive(async () => {
      await this.db.meta.delete('fullLoad');
      await this.runFullLoad(expected);
    });
  }

  incremental(): Promise<void> {
    return this.exclusive(() => this.runIncremental());
  }

  /**
   * Carga paginada por cursor. O cursor fica salvo a cada página:
   * se a aba fechar no meio, a próxima abertura continua de onde parou.
   */
  private async runFullLoad(expected?: number): Promise<void> {
    const resumed = await this.db.getMeta<FullLoadState>('fullLoad');
    const state: FullLoadState = resumed ?? { cursor: null, loaded: 0, pages: 0, startedAt: this.now().toISOString() };
    // Só dá para remover cards excluídos quando a passada é completa, do início ao fim.
    const seen = resumed ? null : new Set<string>();

    this.progress({ phase: 'full', loaded: state.loaded, expected, pages: state.pages });
    for (;;) {
      const data = await this.client.query<AllCardsResponse>(ALL_CARDS, {
        pipeId: this.client.pipeId,
        after: state.cursor,
      });
      const page = data.allCards;
      const cards = page.edges.map((e) => mapCard(e.node));
      await this.db.cards.bulkPut(cards);
      cards.forEach((c) => seen?.add(c.id));

      state.cursor = page.pageInfo.endCursor;
      state.loaded += cards.length;
      state.pages += 1;
      await this.db.setMeta('fullLoad', state);
      this.progress({ phase: 'full', loaded: state.loaded, expected, pages: state.pages });
      if (state.pages === 1 || state.pages % 10 === 0) this.opts.onData?.();
      if (!page.pageInfo.hasNextPage || !state.cursor) break;
    }

    if (seen) {
      const stale = (await this.db.cards.toCollection().primaryKeys()).filter((id) => !seen.has(id));
      if (stale.length) await this.db.cards.bulkDelete(stale);
    }
    await this.db.meta.delete('fullLoad');
    await this.db.setMeta('lastFullSync', state.startedAt);
    const prev = await this.lastSync();
    if (!prev || prev < state.startedAt) await this.db.setMeta('lastSync', state.startedAt);
    this.opts.onData?.();
    this.progress({ phase: 'idle', loaded: state.loaded, expected, pages: state.pages });
  }

  /** Pergunta ao Worker quais cards mudaram e busca só esses, com as permissões do usuário. */
  private async runIncremental(): Promise<void> {
    if (!this.opts.changesUrl) return;
    const since = await this.lastSync();
    if (!since) return;
    const token = await this.client.getAuthToken();
    if (!token) return;

    this.progress({ phase: 'incremental', loaded: 0, pages: 0 });
    const url = new URL(this.opts.changesUrl);
    url.searchParams.set('pipeId', this.client.pipeId);
    url.searchParams.set('since', since);
    const res = await (this.opts.fetchImpl ?? fetch)(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Endpoint de mudanças respondeu ${res.status}`);
    const body = (await res.json()) as ChangesResponse;
    if (body.truncated) {
      await this.db.meta.delete('fullLoad');
      await this.runFullLoad();
      return;
    }

    const deleted = new Set(body.changes.filter((c) => c.action === 'card.delete').map((c) => c.cardId));
    const toFetch = [...new Set(body.changes.map((c) => c.cardId))].filter((id) => !deleted.has(id));
    if (deleted.size) await this.db.cards.bulkDelete([...deleted]);

    let loaded = 0;
    for (let i = 0; i < toFetch.length; i += BATCH_BY_ID) {
      const ids = toFetch.slice(i, i + BATCH_BY_ID);
      const data = await this.client.query<Record<string, RawCard | null>>(cardsByIdQuery(ids));
      const found: CardRecord[] = [];
      const missing: string[] = [];
      ids.forEach((id, idx) => {
        const raw = data[`c${idx}`];
        if (raw) found.push(mapCard(raw));
        else missing.push(id); // excluído ou sem permissão para este usuário
      });
      await this.db.cards.bulkPut(found);
      if (missing.length) await this.db.cards.bulkDelete(missing);
      loaded += ids.length;
      this.progress({ phase: 'incremental', loaded, expected: toFetch.length, pages: i / BATCH_BY_ID + 1 });
    }

    await this.db.setMeta('lastSync', body.now);
    if (body.changes.length) this.opts.onData?.();
    this.progress({ phase: 'idle', loaded, pages: 0 });
  }
}
