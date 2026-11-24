import { describe, expect, it } from 'vitest';
import { chartOption } from './chartOptions';

const rows = [
  { key: 'a', label: 'A', value: 2 },
  { key: 'b', label: 'B', value: 1 },
];

describe('chartOption', () => {
  it('colunas usam categorias no eixo X', () => {
    const o = chartOption('bar', rows) as { xAxis: { type: string; data: string[] } };
    expect(o.xAxis.type).toBe('category');
    expect(o.xAxis.data).toEqual(['A', 'B']);
  });

  it('barras usam categorias no eixo Y, do maior para o menor de cima para baixo', () => {
    const o = chartOption('hbar', rows) as { yAxis: { type: string; inverse: boolean }; xAxis: { type: string } };
    expect(o.yAxis).toMatchObject({ type: 'category', inverse: true });
    expect(o.xAxis.type).toBe('value');
  });

  it('funil centraliza as barras com um espaçador invisível', () => {
    const o = chartOption('funnel', rows) as { series: Array<{ data: number[] }> };
    expect(o.series[0].data).toEqual([0, 0.5]);
    expect(o.series[1].data).toEqual([2, 1]);
  });
});
