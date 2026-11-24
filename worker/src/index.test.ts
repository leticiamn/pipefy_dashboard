import { describe, expect, it, vi } from 'vitest';
import { type Env, handleChanges, handleWebhook } from './index';

/** D1 falso, suficiente para os dois comandos que o Worker usa. */
function fakeDb() {
  const rows: Array<{ pipe_id: string; cardId: string; action: string; at: string }> = [];
  const db = {
    rows,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => ((args = a), stmt),
        async run() {
          if (sql.startsWith('INSERT')) rows.push({ pipe_id: String(args[0]), cardId: String(args[1]), action: String(args[2]), at: String(args[3]) });
          return {};
        },
        async all() {
          const [pipe, since, limit] = args as [string, string, number];
          return { results: rows.filter((r) => r.pipe_id === pipe && r.at > since).slice(0, limit).map(({ cardId, action, at }) => ({ cardId, action, at })) };
        },
      };
      return stmt;
    },
  };
  return db;
}

const env = (db = fakeDb()) =>
  ({ DB: db, WEBHOOK_SECRET: 's3cret', ALLOWED_PIPE_IDS: '307436009', ASSETS: {} }) as unknown as Env & { DB: ReturnType<typeof fakeDb> };

const hook = (secret: string, pipeId: string, body: unknown) =>
  new Request(`https://w.test/webhooks/pipefy/${secret}?pipeId=${pipeId}`, { method: 'POST', body: JSON.stringify(body) });

describe('webhook', () => {
  it('grava id e ação do card com o segredo certo', async () => {
    const e = env();
    const res = await handleWebhook(hook('s3cret', '307436009', { data: { action: 'card.move', card: { id: 123 } } }), e, 's3cret');
    expect(res.status).toBe(200);
    expect(e.DB.rows).toHaveLength(1);
    expect(e.DB.rows[0]).toMatchObject({ cardId: '123', action: 'card.move' });
  });

  it('recusa segredo errado e pipe não permitido', async () => {
    const e = env();
    expect((await handleWebhook(hook('x', '307436009', {}), e, 'x')).status).toBe(403);
    expect((await handleWebhook(hook('s3cret', '1', {}), e, 's3cret')).status).toBe(403);
    expect(e.DB.rows).toHaveLength(0);
  });
});

describe('changes', () => {
  const req = (token?: string) =>
    new Request('https://w.test/api/changes?pipeId=307436009&since=2026-11-01T00:00:00Z', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it('exige token', async () => {
    expect((await handleChanges(req(), env())).status).toBe(401);
  });

  it('recusa usuário que não enxerga o pipe', async () => {
    const api = vi.fn(async () => new Response(JSON.stringify({ data: { me: { id: '1' }, pipe: null } })));
    expect((await handleChanges(req('sem-acesso'), env(), api as unknown as typeof fetch)).status).toBe(403);
  });

  it('devolve só as mudanças depois de since para usuário válido', async () => {
    const e = env();
    e.DB.rows.push(
      { pipe_id: '307436009', cardId: '1', action: 'card.create', at: '2026-10-30T00:00:00.000Z' },
      { pipe_id: '307436009', cardId: '2', action: 'card.move', at: '2026-11-02T00:00:00.000Z' },
    );
    const api = vi.fn(async () => new Response(JSON.stringify({ data: { me: { id: '1' }, pipe: { id: '307436009' } } })));
    const res = await handleChanges(req('valido'), e, api as unknown as typeof fetch);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: Array<{ cardId: string }>; now: string };
    expect(body.changes.map((c) => c.cardId)).toEqual(['2']);
    expect(body.now).toBeTruthy();
  });
});
