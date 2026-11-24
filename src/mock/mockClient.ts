import { PAGE_SIZE, type RawCard } from '../pipefy/queries';
import type { PipefyClient } from '../pipefy/sdk';
import { DEMO_FIELDS, DEMO_PHASES, generateCards } from './generateCards';

/**
 * Cliente de demonstração: responde às mesmas consultas do app com 20 mil cards gerados.
 * Serve para rodar e medir o app fora do Pipefy (`npm run dev` e abrir /dashboard.html).
 */
export function demoClient(count = 20_000, latencyMs = 120): PipefyClient {
  const cards = generateCards(count);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const store = new Map<string, string>();
  const wait = () => new Promise((r) => setTimeout(r, latencyMs));

  return {
    mode: 'demo',
    pipeId: 'demo',
    async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      await wait();
      if (query.includes('DashboardPipeMeta')) {
        return {
          me: { id: 'demo-user', name: 'Usuário demo' },
          pipe: {
            id: 'demo',
            name: 'Pipe de demonstração',
            phases: DEMO_PHASES.map((p) => ({ ...p, fields: [] })),
            start_form_fields: DEMO_FIELDS,
            labels: [],
          },
        } as T;
      }
      if (query.includes('DashboardPipeCounts')) {
        const per = new Map<string, number>();
        cards.forEach((c) => per.set(c.current_phase!.id, (per.get(c.current_phase!.id) ?? 0) + 1));
        return {
          pipe: { cards_count: cards.length, phases: DEMO_PHASES.map((p) => ({ ...p, cards_count: per.get(p.id) ?? 0 })) },
        } as T;
      }
      if (query.includes('DashboardAllCards')) {
        const start = variables.after ? Number(variables.after) : 0;
        const slice = cards.slice(start, start + PAGE_SIZE);
        const end = start + slice.length;
        return {
          allCards: {
            pageInfo: { hasNextPage: end < cards.length, endCursor: String(end) },
            edges: slice.map((node) => ({ node })),
          },
        } as T;
      }
      if (query.includes('DashboardCardsById')) {
        const out: Record<string, RawCard | null> = {};
        for (const m of query.matchAll(/(c\d+): card\(id: "([^"]+)"\)/g)) out[m[1]] = byId.get(m[2]) ?? null;
        return out as T;
      }
      throw new Error('Consulta não suportada no modo demo');
    },
    async getAuthToken() {
      return null;
    },
    async getPrivate(key) {
      try {
        return localStorage.getItem(`demo:${key}`) ?? store.get(key) ?? null;
      } catch {
        return store.get(key) ?? null;
      }
    },
    async setPrivate(key, value) {
      store.set(key, value);
      try {
        localStorage.setItem(`demo:${key}`, value);
      } catch {
        /* sem localStorage: fica só em memória */
      }
    },
    onCardChange() {},
  };
}
