import { describe, expect, it } from 'vitest';
import { parseDashboard } from './dashboardStore';

const view = {
  id: 'v1',
  title: 'T',
  chart: 'bar',
  dimension: { kind: 'phase' },
  metric: { kind: 'count' },
  filters: [],
};

describe('parseDashboard', () => {
  it('aceita uma configuração válida em texto', () => {
    const raw = JSON.stringify({ version: 1, views: [view], layout: [{ i: 'v1', x: 0, y: 0, w: 6, h: 5 }] });
    expect(parseDashboard(raw)?.views).toHaveLength(1);
  });

  it('descarta visões inválidas e posições órfãs', () => {
    const parsed = parseDashboard({
      version: 1,
      views: [view, { id: 'v2', chart: 'radar' }, null],
      layout: [
        { i: 'v1', x: 0, y: 0, w: 6, h: 5 },
        { i: 'v2', x: 0, y: 0, w: 6, h: 5 },
      ],
    });
    expect(parsed?.views.map((v) => v.id)).toEqual(['v1']);
    expect(parsed?.layout.map((l) => l.i)).toEqual(['v1']);
  });

  it('cria posição para visão sem layout', () => {
    expect(parseDashboard({ version: 1, views: [view], layout: [] })?.layout).toEqual([
      expect.objectContaining({ i: 'v1' }),
    ]);
  });

  it('recusa texto inválido e versão desconhecida', () => {
    expect(parseDashboard('{')).toBeNull();
    expect(parseDashboard({ version: 2, views: [], layout: [] })).toBeNull();
  });
});
