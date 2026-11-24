import { handleChanges } from './changes';
import type { Env } from './env';
import { corsHeaders, json } from './http';
import { handleWebhook } from './webhook';

export type { Env } from './env';

const RETENTION_DAYS = 30;
const WEBHOOK_PREFIX = '/webhooks/pipefy';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && (pathname === WEBHOOK_PREFIX || pathname.startsWith(`${WEBHOOK_PREFIX}/`))) {
      return handleWebhook(request, env, pathname.slice(WEBHOOK_PREFIX.length + 1));
    }
    if (pathname === '/api/changes') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      if (request.method === 'GET') return handleChanges(request, env);
      return json({ error: 'method not allowed' }, 405);
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/webhooks/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    await env.DB.prepare('DELETE FROM changes WHERE at < ?1').bind(cutoff).run();
  },
} satisfies ExportedHandler<Env>;
