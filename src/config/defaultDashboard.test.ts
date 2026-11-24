import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS } from '../mock/generateCards';
import { defaultDashboard } from './defaultDashboard';

describe('defaultDashboard', () => {
  it('monta as visões a partir dos campos do pipe', () => {
    const d = defaultDashboard(DEMO_FIELDS);
    const titles = d.views.map((v) => v.title);
    expect(titles).toContain('Valor Total (soma)');
    expect(titles).toContain('Valor Total por Estado');
    expect(titles).toContain('Cards por mês de Data Limite');
    expect(titles).toContain('Top 10 Empresa por Valor Total');
    expect(titles).toContain('Cards por Cidade');
    expect(titles).toContain('Funil por fase');
    expect(titles).toContain('Valor Total por fase');
    expect(titles).toContain('Tempo médio até concluir');
    expect(titles).toContain('Cards concluídos por mês');
    expect(titles).toContain('Valor Total médio por Estado');
    expect(d.views.some((v) => v.chart === 'pie')).toBe(false);
    expect(d.layout.map((l) => l.i)).toEqual(d.views.map((v) => v.id));
  });

  it('funciona com pipe sem campos', () => {
    const d = defaultDashboard([]);
    expect(d.views.length).toBeGreaterThanOrEqual(4);
    expect(d.views.every((v) => v.metric.kind !== 'sum' && v.metric.kind !== 'avg')).toBe(true);
  });
});
