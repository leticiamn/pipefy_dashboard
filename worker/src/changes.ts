import { userCanReadPipe } from './auth';
import { allowedPipes, type Env } from './env';
import { corsHeaders, json } from './http';

const MAX_CHANGES = 5000;

interface ChangeRow {
  cardId: string;
  action: string;
  at: string;
}

export async function handleChanges(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);
  const pipeId = url.searchParams.get('pipeId') ?? '';
  const since = url.searchParams.get('since') ?? '';
  if (!allowedPipes(env).has(pipeId)) return json({ error: 'pipe not allowed' }, 403, cors);
  if (Number.isNaN(Date.parse(since))) return json({ error: 'invalid since' }, 400, cors);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json({ error: 'unauthorized' }, 401, cors);
  if (!(await userCanReadPipe(token, pipeId, env, fetchImpl))) return json({ error: 'forbidden' }, 403, cors);

  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    'SELECT card_id AS cardId, action, at FROM changes WHERE pipe_id = ?1 AND at > ?2 ORDER BY at LIMIT ?3',
  )
    .bind(pipeId, new Date(since).toISOString(), MAX_CHANGES + 1)
    .all<ChangeRow>();

  // Acima do limite, recarregar tudo sai mais barato que buscar card a card.
  const truncated = results.length > MAX_CHANGES;
  return json({ changes: truncated ? [] : results, now, truncated }, 200, cors);
}
