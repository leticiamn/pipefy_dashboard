import { DashboardDb } from '../data/db';
import { aggregate } from './aggregate';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { AggregateResult, CardRecord, ViewConfig } from './types';

type Pending = { view: ViewConfig; resolve: (r: AggregateResult) => void; reject: (e: Error) => void; timer: number };

const WORKER_TIMEOUT_MS = 15_000;

/**
 * Fachada da thread principal para o Web Worker de agregação.
 * Se o Worker não iniciar ou não responder (iframe restrito, erro de carga), a agregação
 * passa a rodar na thread principal: mais lento, mas o painel continua funcionando.
 */
export class AggregationClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private dbName: string | null = null;
  private fallbackCards: Promise<CardRecord[]> | null = null;

  constructor() {
    try {
      this.worker = new Worker(new URL('./aggregate.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        const p = this.pending.get(msg.requestId);
        if (!p) return;
        this.pending.delete(msg.requestId);
        window.clearTimeout(p.timer);
        if (msg.type === 'result') p.resolve(msg.result);
        else p.reject(new Error(msg.message));
      };
      this.worker.onerror = (event) => {
        console.warn('[dashboard] Web Worker falhou, usando a thread principal', event.message);
        this.useFallback();
      };
    } catch (err) {
      console.warn('[dashboard] Web Worker indisponível, usando a thread principal', err);
      this.worker = null;
    }
  }

  /** Desliga o Worker e refaz na thread principal tudo o que estava pendente. */
  private useFallback() {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const p of waiting) {
      window.clearTimeout(p.timer);
      this.aggregateOnMainThread(p.view).then(p.resolve, p.reject);
    }
  }

  private async aggregateOnMainThread(view: ViewConfig): Promise<AggregateResult> {
    if (!this.dbName) return { rows: [], total: 0, cardCount: 0 };
    this.fallbackCards ??= new DashboardDb(this.dbName).cards.toArray();
    return aggregate(await this.fallbackCards, view);
  }

  private send(msg: WorkerRequest) {
    this.worker?.postMessage(msg);
  }

  open(dbName: string) {
    this.dbName = dbName;
    this.fallbackCards = null;
    this.send({ type: 'open', dbName });
  }

  /** Avisa que o cache mudou: os cards são relidos na próxima agregação. */
  invalidate() {
    this.fallbackCards = null;
    this.send({ type: 'invalidate' });
  }

  aggregate(view: ViewConfig): Promise<AggregateResult> {
    if (!this.worker) return this.aggregateOnMainThread(view);
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        console.warn('[dashboard] Web Worker sem resposta, usando a thread principal');
        this.useFallback();
      }, WORKER_TIMEOUT_MS);
      this.pending.set(requestId, { view, resolve, reject, timer });
      this.send({ type: 'aggregate', requestId, view });
    });
  }

  terminate() {
    this.worker?.terminate();
  }
}
