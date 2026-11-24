/** Tipos mínimos do Pipefy Apps Client SDK, carregado por <script> no HTML. */
export interface GraphQLResult<T> {
  data?: T | null;
  errors?: unknown;
}

export interface PipefySdkClient {
  app: { pipeId?: string | number; cardId?: string | number };
  query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResult<T>>;
  getAuthToken?(): Promise<string>;
  get(scope: 'organization' | 'pipe' | 'card', visibility: 'private' | 'public', key: string): Promise<unknown>;
  set(
    scope: 'organization' | 'pipe' | 'card',
    visibility: 'private' | 'public',
    key: string,
    value: string,
  ): Promise<unknown>;
}

interface PipefyAppGlobal {
  init(): PipefySdkClient;
  initCall(features: Record<string, (p: PipefySdkClient, ctx: unknown) => unknown>): void;
  render(callback: () => void): void;
  registerListener?(
    event: 'onCardCreated' | 'onCardDeleted' | 'onCardUpdated' | 'onFilterChanged',
    cb: (payload: unknown) => void,
  ): void;
}

declare global {
  interface Window {
    PipefyApp?: PipefyAppGlobal;
  }
}

export interface PipefyClient {
  mode: 'pipefy' | 'demo';
  pipeId: string;
  query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  getAuthToken(): Promise<string | null>;
  getPrivate(key: string): Promise<string | null>;
  setPrivate(key: string, value: string): Promise<void>;
  onCardChange(cb: () => void): () => void;
}

export class PipefyQueryError extends Error {
  constructor(public readonly details: unknown) {
    super(`Erro na API do Pipefy: ${describe(details)}`);
  }
}

function describe(errors: unknown): string {
  if (Array.isArray(errors)) return errors.map((e) => (e as { message?: string })?.message ?? String(e)).join('; ');
  if (errors instanceof Error) return errors.message;
  return String(errors);
}

const CARD_EVENTS = ['onCardCreated', 'onCardUpdated', 'onCardDeleted'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O SDK nunca rejeita a promise: o erro vem em `errors` na resposta. */
export async function withRetry<T>(run: () => Promise<GraphQLResult<T>>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const res = await run();
    if (res.data && !res.errors) return res.data;
    lastError = res.errors ?? 'resposta vazia';
    if (i < attempts - 1) await sleep(500 * 2 ** i);
  }
  throw new PipefyQueryError(lastError);
}

export function sdkClient(p: PipefySdkClient, registerListener?: PipefyAppGlobal['registerListener']): PipefyClient {
  const pipeId = String(p.app.pipeId ?? '');
  return {
    mode: 'pipefy',
    pipeId,
    query: (query, variables) => withRetry(() => p.query(query, variables)),
    async getAuthToken() {
      if (!p.getAuthToken) return null;
      try {
        return (await p.getAuthToken()) || null;
      } catch {
        return null;
      }
    },
    async getPrivate(key) {
      const v = await p.get('pipe', 'private', key);
      return typeof v === 'string' && v ? v : null;
    },
    async setPrivate(key, value) {
      await p.set('pipe', 'private', key, value);
    },
    onCardChange(cb) {
      // O SDK não oferece remoção de listener: a inscrição é desativada localmente.
      let active = true;
      const handler = () => active && cb();
      CARD_EVENTS.forEach((event) => registerListener?.(event, handler));
      return () => {
        active = false;
      };
    },
  };
}
