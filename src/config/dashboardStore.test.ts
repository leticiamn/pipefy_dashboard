import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS } from '../mock/generateCards';
import { defaultDashboard } from './dashboardStore';

describe('defaultDashboard', () => {
  it('monta as visões a partir dos campos do pipe', () => {
    const d = defaultDashboard(DEMO_FIELDS);
    const titles = d.views.map((v) => v.title);
    expect(titles).toContain('Valor Total (soma)');
    expect(titles).toContain('Valor Total por Estado');
    expect(titles).toContain('Cards por mês de Data Limite');
    expect(titles).toContain('Top 10 Empresa por Valor Total');
    expect(titles).toContain('Cards por Cidade');
    expect(d.layout.map((l) => l.i)).toEqual(d.views.map((v) => v.id));
  });

  it('funciona com pipe sem campos', () => {
    const d = defaultDashboard([]);
    expect(d.views.length).toBeGreaterThanOrEqual(4);
    expect(d.views.every((v) => v.metric.kind === 'count')).toBe(true);
  });
});
