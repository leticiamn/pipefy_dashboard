import type { AggregateResult, ViewConfig } from './types';

export type WorkerRequest =
  | { type: 'open'; dbName: string }
  | { type: 'invalidate' }
  | { type: 'aggregate'; requestId: number; view: ViewConfig };

export type WorkerResponse =
  | { type: 'result'; requestId: number; result: AggregateResult; ms: number }
  | { type: 'error'; requestId: number; message: string };
