import type { AggregateResult, ViewConfig } from './types';

const CUMULATIVE_METRICS = new Set(['count', 'sum']);

/** Reordena as linhas pela ordem dada (ex.: fases do pipe); chaves fora da lista vão para o fim. */
export function orderRows(result: AggregateResult, order: string[]): AggregateResult {
  const rank = new Map(order.map((key, i) => [key, i]));
  const pos = (key: string) => rank.get(key) ?? order.length;
  return { ...result, rows: [...result.rows].sort((a, b) => pos(a.key) - pos(b.key)) };
}

/**
 * Funil: cada etapa soma ela mesma e as seguintes, ou seja, quantos cards chegaram até ali.
 * Pressupõe que os cards avançam pelas fases na ordem das linhas.
 */
export function reachedRows(result: AggregateResult): AggregateResult {
  let acc = 0;
  const rows = [...result.rows].reverse().map((r) => ({ ...r, value: (acc += r.value) }));
  return { ...result, rows: rows.reverse() };
}

/** Ajusta o resultado para exibição: fases na ordem do pipe e, no funil, o acumulado por etapa. */
export function presentResult(
  view: Pick<ViewConfig, 'chart' | 'dimension' | 'metric'>,
  result: AggregateResult,
  phaseOrder: string[],
): AggregateResult {
  if (view.dimension.kind !== 'phase') return result;
  const ordered = orderRows(result, phaseOrder);
  return view.chart === 'funnel' && CUMULATIVE_METRICS.has(view.metric.kind) ? reachedRows(ordered) : ordered;
}
