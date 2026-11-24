/// <reference lib="webworker" />
import { DashboardDb } from '../data/db';
import { aggregate } from './aggregate';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { CardRecord, ViewConfig } from './types';

// Os cards ficam em memória dentro do Worker: a tela só recebe o resultado de cada gráfico.
let db: DashboardDb | null = null;
let cards: CardRecord[] | null = null;
let loading: Promise<CardRecord[]> | null = null;
const resultCache = new Map<string, ReturnType<typeof aggregate>>();

function load(): Promise<CardRecord[]> {
  if (cards) return Promise.resolve(cards);
  if (!db) return Promise.resolve([]);
  loading ??= db.cards.toArray().then((all) => {
    cards = all;
    loading = null;
    return all;
  });
  return loading;
}

const cacheKey = (view: ViewConfig) =>
  JSON.stringify([view.dimension, view.metric, view.filters, view.limit ?? 0]);

function post(msg: WorkerResponse) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'open') {
    db?.close();
    db = new DashboardDb(msg.dbName);
    cards = null;
    resultCache.clear();
    return;
  }
  if (msg.type === 'invalidate') {
    cards = null;
    resultCache.clear();
    return;
  }
  const started = performance.now();
  try {
    const key = cacheKey(msg.view);
    let result = resultCache.get(key);
    if (!result) {
      result = aggregate(await load(), msg.view);
      resultCache.set(key, result);
    }
    post({ type: 'result', requestId: msg.requestId, result, ms: Math.round(performance.now() - started) });
  } catch (err) {
    post({ type: 'error', requestId: msg.requestId, message: err instanceof Error ? err.message : String(err) });
  }
};
