import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { demoClient } from '../mock/mockClient';
import { openDb } from './db';
import { SyncEngine } from './sync';

const fresh = () => openDb(`u-${Math.random()}`, 'demo');

describe('SyncEngine', () => {
  it('faz a carga completa paginada e grava todos os cards', async () => {
    const db = fresh();
    const client = demoClient(230, 0);
    const pages: number[] = [];
    const engine = new SyncEngine(client, db, { onProgress: (p) => pages.push(p.pages) });
    await engine.start();
    expect(await db.cards.count()).toBe(230);
    expect(Math.max(...pages)).toBe(5); // 50 por página
    expect(await db.getMeta('fullLoad')).toBeUndefined();
    expect(await engine.lastSync()).toBeTruthy();
  });

  it('retoma a carga a partir do cursor salvo', async () => {
    const db = fresh();
    const client = demoClient(120, 0);
    await db.setMeta('fullLoad', { cursor: '100', loaded: 100, pages: 2, startedAt: '2026-11-20T00:00:00Z' });
    const spy = vi.spyOn(client, 'query');
    await new SyncEngine(client, db).start();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await db.cards.count()).toBe(20);
  });

  it('busca só os cards alterados que o Worker informa e remove os excluídos', async () => {
    const db = fresh();
    const client = demoClient(60, 0);
    client.getAuthToken = async () => 'token-usuario';
    await new SyncEngine(client, db).start();
    await db.cards.update('900000001', { title: 'antigo' });

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('pipeId=demo');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-usuario');
      return new Response(
        JSON.stringify({
          now: '2030-01-01T00:00:00.000Z',
          changes: [
            { cardId: '900000001', action: 'card.field_update', at: '2030-01-01T00:00:00Z' },
            { cardId: '900000002', action: 'card.delete', at: '2030-01-01T00:00:00Z' },
          ],
        }),
      );
    });
    const engine = new SyncEngine(client, db, { changesUrl: 'https://worker.test/api/changes', fetchImpl: fetchImpl as unknown as typeof fetch });
    await engine.incremental();

    expect((await db.cards.get('900000001'))?.title).toBe('Pedido #10001');
    expect(await db.cards.get('900000002')).toBeUndefined();
    expect(await engine.lastSync()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('separa o cache por usuário', async () => {
    const a = openDb('ana', 'demo');
    const b = openDb('bruno', 'demo');
    await new SyncEngine(demoClient(10, 0), a).start();
    expect(await a.cards.count()).toBe(10);
    expect(await b.cards.count()).toBe(0);
  });
});
