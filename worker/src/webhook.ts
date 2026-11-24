import { allowedPipes, type Env } from './env';
import { isCardId, json, safeEqual } from './http';

export const SECRET_HEADER = 'X-Webhook-Secret';

const ACTIONS = new Set([
  'card.create',
  'card.move',
  'card.field_update',
  'card.done',
  'card.delete',
  'card.late',
  'card.overdue',
  'card.expired',
]);

interface WebhookPayload {
  data?: { action?: unknown; card?: { id?: unknown } };
}

export async function handleWebhook(request: Request, env: Env, pathSecret = ''): Promise<Response> {
  const secret = request.headers.get(SECRET_HEADER) ?? pathSecret;
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
  const action = payload.data?.action;
  if (!isCardId(cardId) || typeof action !== 'string' || !ACTIONS.has(action)) return json({ ok: true, ignored: true });

  await env.DB.prepare('INSERT INTO changes (pipe_id, card_id, action, at) VALUES (?1, ?2, ?3, ?4)')
    .bind(pipeId, String(cardId), action, new Date().toISOString())
    .run();
  return json({ ok: true });
}
