import type { CardRecord } from '../analytics/types';
import { isCardId } from '../lib/parse';
import { mapCard } from '../pipefy/mapCard';
import { ALL_CARDS, type AllCardsResponse, cardsByIdQuery, type RawCard } from '../pipefy/queries';
import type { PipefyClient } from '../pipefy/sdk';
import type { DashboardDb } from './db';

export interface SyncProgress {
  phase: 'idle' | 'full' | 'incremental';
  loaded: number;
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
  /** Hora do servidor: vira o próximo `since`, sem depender do relógio do navegador. */
  now: string;
  truncated?: boolean;
}

interface FullLoadState {
  cursor: string | null;
  loaded: number;
  pages: number;
  startedAt: string;
}

export interface SyncOptions {
  changesUrl?: string;
  onProgress?: (p: SyncProgress) => void;
  onData?: () => void;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const DAY_MS = 86_400_000;
const BATCH_BY_ID = 20;
const NOTIFY_EVERY_PAGES = 10;
const META = {
  fullLoad: 'fullLoad',
  lastFullSync: 'lastFullSync',
  lastSync: 'lastSync',
  cardFormat: 'cardFormat',
} as const;

export class SyncEngine {
  private running: Promise<void> | null = null;

  constructor(
    private readonly client: PipefyClient,
    private readonly db: DashboardDb,
    private readonly opts: SyncOptions = {},
  ) {}

  async lastSync(): Promise<string | null> {
    return (await this.db.getMeta<string>(META.lastSync)) ?? null;
  }

  async ensureFormat(format: number): Promise<void> {
    if ((await this.db.getMeta<number>(META.cardFormat)) === format) return;
    await this.resetCache();
    await this.db.setMeta(META.cardFormat, format);
  }

  async resetCache(): Promise<void> {
    await this.db.cards.clear();
    await this.db.meta.bulkDelete([META.fullLoad, META.lastFullSync, META.lastSync]);
  }

  start(expected?: number): Promise<void> {
    return this.exclusive(async () => {
      const pending = await this.db.getMeta<FullLoadState>(META.fullLoad);
      const lastFull = await this.db.getMeta<string>(META.lastFullSync);
      if (pending || !lastFull) return this.runFullLoad(expected);

      try {
        await this.runIncremental();
      } catch (err) {
        console.warn('[dashboard] incremental falhou', err);
      }
      if (this.now().getTime() - Date.parse(lastFull) > DAY_MS) await this.runFullLoad(expected);
    });
  }

  reloadAll(expected?: number): Promise<void> {
    return this.exclusive(async () => {
      await this.db.meta.delete(META.fullLoad);
      await this.runFullLoad(expected);
    });
  }

  incremental(): Promise<void> {
    return this.exclusive(() => this.runIncremental());
  }

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  private exclusive(task: () => Promise<void>): Promise<void> {
    this.running ??= task().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** O cursor é salvo a cada página: se a aba fechar no meio, a próxima abertura continua dali. */
  private async runFullLoad(expected?: number): Promise<void> {
    const resumed = await this.db.getMeta<FullLoadState>(META.fullLoad);
    const state = resumed ?? { cursor: null, loaded: 0, pages: 0, startedAt: this.now().toISOString() };
    // Cards excluídos só podem ser detectados numa passada completa, do início ao fim.
    const seen = resumed ? null : new Set<string>();
    const report = (phase: SyncProgress['phase']) =>
      this.opts.onProgress?.({ phase, loaded: state.loaded, expected, pages: state.pages });

    report('full');
    let hasNext = true;
    while (hasNext) {
      const { allCards } = await this.client.query<AllCardsResponse>(ALL_CARDS, {
        pipeId: this.client.pipeId,
        after: state.cursor,
      });
      const cards = allCards.edges.map((e) => mapCard(e.node));
      await this.db.cards.bulkPut(cards);
      cards.forEach((c) => seen?.add(c.id));

      state.cursor = allCards.pageInfo.endCursor;
      state.loaded += cards.length;
      state.pages += 1;
      await this.db.setMeta(META.fullLoad, state);
      report('full');
      if (state.pages === 1 || state.pages % NOTIFY_EVERY_PAGES === 0) this.opts.onData?.();
      hasNext = allCards.pageInfo.hasNextPage && Boolean(state.cursor);
    }

    if (seen) {
      const stale = (await this.db.cards.toCollection().primaryKeys()).filter((id) => !seen.has(id));
      await this.db.cards.bulkDelete(stale);
    }
    await this.db.meta.delete(META.fullLoad);
    await this.db.setMeta(META.lastFullSync, state.startedAt);
    const prev = await this.lastSync();
    if (!prev || prev < state.startedAt) await this.db.setMeta(META.lastSync, state.startedAt);
    this.opts.onData?.();
    report('idle');
  }

  private async runIncremental(): Promise<void> {
    const { changesUrl } = this.opts;
    if (!changesUrl) return;
    const since = await this.lastSync();
    const token = since ? await this.client.getAuthToken() : null;
    if (!since || !token) return;

    this.opts.onProgress?.({ phase: 'incremental', loaded: 0, pages: 0 });
    const body = await this.fetchChanges(changesUrl, since, token);
    if (body.truncated) {
      await this.db.meta.delete(META.fullLoad);
      return this.runFullLoad();
    }

    const changes = body.changes.filter((c) => isCardId(c.cardId));
    const deleted = new Set(changes.filter((c) => c.action === 'card.delete').map((c) => c.cardId));
    const toFetch = [...new Set(changes.map((c) => c.cardId))].filter((id) => !deleted.has(id));
    await this.db.cards.bulkDelete([...deleted]);

    for (let i = 0; i < toFetch.length; i += BATCH_BY_ID) {
      await this.refreshCards(toFetch.slice(i, i + BATCH_BY_ID));
      this.opts.onProgress?.({
        phase: 'incremental',
        loaded: Math.min(i + BATCH_BY_ID, toFetch.length),
        expected: toFetch.length,
        pages: i / BATCH_BY_ID + 1,
      });
    }

    await this.db.setMeta(META.lastSync, body.now);
    if (changes.length) this.opts.onData?.();
    this.opts.onProgress?.({ phase: 'idle', loaded: toFetch.length, pages: 0 });
  }

  private async fetchChanges(changesUrl: string, since: string, token: string): Promise<ChangesResponse> {
    const url = new URL(changesUrl);
    url.searchParams.set('pipeId', this.client.pipeId);
    url.searchParams.set('since', since);
    const res = await (this.opts.fetchImpl ?? fetch)(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Endpoint de mudanças respondeu ${res.status}`);
    return (await res.json()) as ChangesResponse;
  }

  /** Card que não volta foi excluído ou deixou de ser visível para este usuário. */
  private async refreshCards(ids: string[]): Promise<void> {
    const { query, variables } = cardsByIdQuery(ids);
    const data = await this.client.query<Record<string, RawCard | null>>(query, variables);
    const found: CardRecord[] = [];
    const missing: string[] = [];
    ids.forEach((id, i) => {
      const raw = data[`c${i}`];
      if (raw) found.push(mapCard(raw));
      else missing.push(id);
    });
    await this.db.cards.bulkPut(found);
    await this.db.cards.bulkDelete(missing);
  }
}
