import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache } from './auth';
import { handleChanges } from './changes';
import type { Env } from './env';
import { handleWebhook, SECRET_HEADER } from './webhook';

interface Row {
  pipe_id: string;
  cardId: string;
  action: string;
  at: string;
}

function fakeDb() {
  const rows: Row[] = [];
  return {
    rows,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => ((args = a), stmt),
        async run() {
          if (sql.startsWith('INSERT')) {
            const [pipe_id, cardId, action, at] = args.map(String);
            rows.push({ pipe_id, cardId, action, at });
          }
          return {};
        },
        async all() {
          const [pipe, since, limit] = args as [string, string, number];
          const results = rows
            .filter((r) => r.pipe_id === pipe && r.at > since)
            .slice(0, limit)
            .map(({ cardId, action, at }) => ({ cardId, action, at }));
          return { results };
        },
      };
      return stmt;
    },
  };
}

const PIPE = '307436009';
const ORIGIN = 'https://app.example.test';

const env = (db = fakeDb()) =>
  ({
    DB: db,
    WEBHOOK_SECRET: 's3cret',
    ALLOWED_PIPE_IDS: PIPE,
    ALLOWED_ORIGINS: ORIGIN,
    ASSETS: {},
  }) as unknown as Env & {
    DB: ReturnType<typeof fakeDb>;
  };

const hook = (body: unknown, { secret = 's3cret', pipeId = PIPE } = {}) =>
  new Request(`https://w.test/webhooks/pipefy?pipeId=${pipeId}`, {
    method: 'POST',
    headers: { [SECRET_HEADER]: secret },
    body: JSON.stringify(body),
  });

const pipefyApi = (pipe: { id: string } | null) =>
  vi.fn(async () => new Response(JSON.stringify({ data: { me: { id: '1' }, pipe } }))) as unknown as typeof fetch;

describe('webhook', () => {
  it('grava id e ação do card com o segredo no header', async () => {
    const e = env();
    const res = await handleWebhook(hook({ data: { action: 'card.move', card: { id: 123 } } }), e);
    expect(res.status).toBe(200);
    expect(e.DB.rows).toEqual([expect.objectContaining({ cardId: '123', action: 'card.move' })]);
  });

  it('aceita o segredo no caminho da URL', async () => {
    const e = env();
    const req = new Request(`https://w.test/webhooks/pipefy/s3cret?pipeId=${PIPE}`, {
      method: 'POST',
      body: JSON.stringify({ data: { action: 'card.done', card: { id: 1 } } }),
    });
    expect((await handleWebhook(req, e, 's3cret')).status).toBe(200);
    expect(e.DB.rows).toHaveLength(1);
  });

  it('recusa segredo errado e pipe não permitido', async () => {
    const e = env();
    expect((await handleWebhook(hook({}, { secret: 'x' }), e)).status).toBe(403);
    expect((await handleWebhook(hook({}, { pipeId: '1' }), e)).status).toBe(403);
    expect(e.DB.rows).toHaveLength(0);
  });

  it('ignora ação desconhecida e id de card inválido', async () => {
    const e = env();
    await handleWebhook(hook({ data: { action: 'card.move', card: { id: '1; DROP' } } }), e);
    await handleWebhook(hook({ data: { action: 'anything', card: { id: 5 } } }), e);
    expect(e.DB.rows).toHaveLength(0);
  });
});

describe('changes', () => {
  beforeEach(clearAuthCache);

  const req = (token?: string, origin?: string) =>
    new Request(`https://w.test/api/changes?pipeId=${PIPE}&since=2026-11-01T00:00:00Z`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
    });

  it('exige token', async () => {
    expect((await handleChanges(req(), env())).status).toBe(401);
  });

  it('recusa usuário que não enxerga o pipe', async () => {
    expect((await handleChanges(req('sem-acesso'), env(), pipefyApi(null))).status).toBe(403);
  });

  it('devolve só as mudanças depois de since para usuário válido', async () => {
    const e = env();
    e.DB.rows.push(
      { pipe_id: PIPE, cardId: '1', action: 'card.create', at: '2026-10-30T00:00:00.000Z' },
      { pipe_id: PIPE, cardId: '2', action: 'card.move', at: '2026-11-02T00:00:00.000Z' },
    );
    const res = await handleChanges(req('valido'), e, pipefyApi({ id: PIPE }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: Array<{ cardId: string }>; now: string };
    expect(body.changes.map((c) => c.cardId)).toEqual(['2']);
    expect(body.now).toBeTruthy();
  });

  it('envia CORS só para origens permitidas', async () => {
    const ok = await handleChanges(req('valido', ORIGIN), env(), pipefyApi({ id: PIPE }));
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const other = await handleChanges(req('valido', 'https://evil.test'), env(), pipefyApi({ id: PIPE }));
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
