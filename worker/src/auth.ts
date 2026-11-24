import type { Env } from './env';

const DEFAULT_API = 'https://api.pipefy.com/graphql';
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 1000;

const WHO_AM_I = 'query DashboardWhoAmI($pipeId: ID!) { me { id } pipe(id: $pipeId) { id } }';

const cache = new Map<string, number>();

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function remember(key: string, now: number) {
  for (const [k, expires] of cache) if (expires <= now) cache.delete(k);
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, now + TTL_MS);
}

export function clearAuthCache() {
  cache.clear();
}

export async function userCanReadPipe(
  token: string,
  pipeId: string,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = await sha256(`${pipeId}:${token}`);
  const now = Date.now();
  if ((cache.get(key) ?? 0) > now) return true;

  const res = await fetchImpl(env.PIPEFY_API_URL ?? DEFAULT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ operationName: 'DashboardWhoAmI', query: WHO_AM_I, variables: { pipeId } }),
  });
  if (!res.ok) return false;

  const body = (await res.json()) as { data?: { me?: { id?: string }; pipe?: { id?: string } | null } };
  const ok = Boolean(body.data?.me?.id && body.data?.pipe?.id);
  if (ok) remember(key, now);
  return ok;
}
