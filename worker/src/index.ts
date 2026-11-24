/**
 * Cloudflare Worker do dashboard.
 * - Serve o app (arquivos estáticos do build).
 * - POST /webhooks/pipefy/<segredo>?pipeId=...  recebe webhooks do pipe e grava id do card + ação + hora.
 * - GET  /api/changes?pipeId=...&since=...      devolve os ids alterados desde `since`,
 *   só para quem prova ser um usuário com acesso ao pipe (token de p.getAuthToken()).
 */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  WEBHOOK_SECRET: string;
  /** Pipes aceitos, separados por vírgula. */
  ALLOWED_PIPE_IDS: string;
  PIPEFY_API_URL?: string;
}

const MAX_CHANGES = 5000;
const RETENTION_DAYS = 30;
const AUTH_CACHE_MS = 5 * 60_000;
const DEFAULT_API = 'https://api.pipefy.com/graphql';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

const allowedPipes = (env: Env) => new Set(env.ALLOWED_PIPE_IDS.split(',').map((s) => s.trim()).filter(Boolean));

/** Compara em tempo constante, para não vazar o segredo pelo tempo de resposta. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface WebhookPayload {
  data?: { action?: string; card?: { id?: string | number } };
}

export async function handleWebhook(request: Request, env: Env, secret: string): Promise<Response> {
  if (!env.WEBHOOK_SECRET || !safeEqual(secret, env.WEBHOOK_SECRET)) return json({ error: 'forbidden' }, 403);
  const pipeId = new URL(request.url).searchParams.get('pipeId') ?? '';
  if (!allowedPipes(env).has(pipeId)) return json({ error: 'pipe not allowed' }, 403);

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const cardId = payload.data?.card?.id;
  const action = payload.data?.action ?? 'unknown';
  if (cardId === undefined || cardId === null) return json({ ok: true, ignored: true });

  await env.DB.prepare('INSERT INTO changes (pipe_id, card_id, action, at) VALUES (?1, ?2, ?3, ?4)')
    .bind(pipeId, String(cardId), action, new Date().toISOString())
    .run();
  return json({ ok: true });
}

// Cache por instância do Worker: evita validar o mesmo token na API a cada minuto.
const authCache = new Map<string, number>();

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Valida o token do usuário na própria API do Pipefy: precisa existir um `me` e o usuário enxergar o pipe. */
export async function userCanReadPipe(token: string, pipeId: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = await sha256(`${pipeId}:${token}`);
  const cached = authCache.get(key);
  if (cached && cached > Date.now()) return true;

  const res = await fetchImpl(env.PIPEFY_API_URL ?? DEFAULT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      operationName: 'DashboardWhoAmI',
      query: 'query DashboardWhoAmI($pipeId: ID!) { me { id } pipe(id: $pipeId) { id } }',
      variables: { pipeId },
    }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { data?: { me?: { id?: string }; pipe?: { id?: string } | null } };
  const ok = Boolean(body.data?.me?.id && body.data?.pipe?.id);
  if (ok) authCache.set(key, Date.now() + AUTH_CACHE_MS);
  return ok;
}

export async function handleChanges(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const pipeId = url.searchParams.get('pipeId') ?? '';
  const since = url.searchParams.get('since') ?? '';
  if (!allowedPipes(env).has(pipeId)) return json({ error: 'pipe not allowed' }, 403, CORS);
  if (!since || Number.isNaN(Date.parse(since))) return json({ error: 'invalid since' }, 400, CORS);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json({ error: 'unauthorized' }, 401, CORS);
  if (!(await userCanReadPipe(token, pipeId, env, fetchImpl))) return json({ error: 'forbidden' }, 403, CORS);

  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    'SELECT card_id AS cardId, action, at FROM changes WHERE pipe_id = ?1 AND at > ?2 ORDER BY at LIMIT ?3',
  )
    .bind(pipeId, new Date(since).toISOString(), MAX_CHANGES + 1)
    .all<{ cardId: string; action: string; at: string }>();

  const truncated = results.length > MAX_CHANGES;
  // Muitas mudanças de uma vez: mais barato o app recarregar tudo do que buscar card a card.
  return json({ changes: truncated ? [] : results, now, truncated }, 200, CORS);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/webhooks/pipefy/') && request.method === 'POST') {
      return handleWebhook(request, env, url.pathname.slice('/webhooks/pipefy/'.length));
    }
    if (url.pathname === '/api/changes') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'GET') return handleChanges(request, env);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },

  /** Limpeza diária: o registro de mudanças só precisa cobrir o intervalo entre duas aberturas. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    await env.DB.prepare('DELETE FROM changes WHERE at < ?1').bind(cutoff).run();
  },
} satisfies ExportedHandler<Env>;
