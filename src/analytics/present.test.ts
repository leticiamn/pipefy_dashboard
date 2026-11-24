import { describe, expect, it } from 'vitest';
import { orderRows, presentResult, reachedRows } from './present';
import type { AggregateResult } from './types';

const result = (pairs: Array<[string, number]>): AggregateResult => ({
  rows: pairs.map(([key, value]) => ({ key, label: key, value })),
  total: 0,
  cardCount: 0,
});
const keys = (r: AggregateResult) => r.rows.map((row) => row.key);
const values = (r: AggregateResult) => r.rows.map((row) => row.value);

describe('orderRows', () => {
  it('segue a ordem dada e manda o resto para o fim', () => {
    expect(
      keys(
        orderRows(
          result([
            ['c', 1],
            ['x', 1],
            ['a', 1],
            ['b', 1],
          ]),
          ['a', 'b', 'c'],
        ),
      ),
    ).toEqual(['a', 'b', 'c', 'x']);
  });
});

describe('reachedRows', () => {
  it('acumula do fim para o início', () => {
    expect(
      values(
        reachedRows(
          result([
            ['a', 5],
            ['b', 3],
            ['c', 2],
          ]),
        ),
      ),
    ).toEqual([10, 5, 2]);
  });
});

describe('presentResult', () => {
  const phases = result([
    ['p2', 3],
    ['p1', 5],
  ]);
  const view = { dimension: { kind: 'phase' }, metric: { kind: 'count' } } as const;

  it('ordena fases e acumula só no funil', () => {
    expect(values(presentResult({ ...view, chart: 'bar' }, phases, ['p1', 'p2']))).toEqual([5, 3]);
    expect(values(presentResult({ ...view, chart: 'funnel' }, phases, ['p1', 'p2']))).toEqual([8, 3]);
  });

  it('não acumula médias nem mexe em outras dimensões', () => {
    const avg = { ...view, chart: 'funnel', metric: { kind: 'avgLeadTimeDays' } } as const;
    expect(values(presentResult(avg, phases, ['p1', 'p2']))).toEqual([5, 3]);
    const other = { ...view, chart: 'funnel', dimension: { kind: 'status' } } as const;
    expect(keys(presentResult(other, phases, ['p1', 'p2']))).toEqual(['p2', 'p1']);
  });
});
