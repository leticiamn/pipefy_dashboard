import { DashboardDb } from '../data/db';
import { aggregate } from './aggregate';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { AggregateResult, CardRecord, ViewConfig } from './types';

interface Pending {
  view: ViewConfig;
  resolve: (r: AggregateResult) => void;
  reject: (e: Error) => void;
  timer: number;
}

const WORKER_TIMEOUT_MS = 15_000;

/** Se o Web Worker não iniciar ou não responder (iframe restrito), a agregação roda na thread principal. */
export class AggregationClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private dbName: string | null = null;
  private timeZone = 'UTC';
  private fallbackCards: Promise<CardRecord[]> | null = null;

  open(dbName: string, timeZone: string) {
    this.dbName = dbName;
    this.timeZone = timeZone;
    this.fallbackCards = null;
    this.startWorker();
    this.send({ type: 'open', dbName, timeZone });
  }

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

  /** Pode ser chamado mais de uma vez: um novo `open` cria outro Worker. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.flushToMainThread();
  }

  private startWorker() {
    if (this.worker || this.workerFailed) return;
    try {
      const worker = new Worker(new URL('./aggregate.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.settle(event.data);
      worker.onerror = (event) => {
        console.warn('[dashboard] Web Worker falhou, usando a thread principal', event.message);
        this.useFallback();
      };
      this.worker = worker;
    } catch (err) {
      console.warn('[dashboard] Web Worker indisponível, usando a thread principal', err);
      this.workerFailed = true;
    }
  }

  private settle(msg: WorkerResponse) {
    const p = this.pending.get(msg.requestId);
    if (!p) return;
    this.pending.delete(msg.requestId);
    window.clearTimeout(p.timer);
    if (msg.type === 'result') p.resolve(msg.result);
    else p.reject(new Error(msg.message));
  }

  private useFallback() {
    this.workerFailed = true;
    this.terminate();
  }

  private flushToMainThread() {
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
    return aggregate(await this.fallbackCards, view, this.timeZone);
  }

  private send(msg: WorkerRequest) {
    this.worker?.postMessage(msg);
  }
}
