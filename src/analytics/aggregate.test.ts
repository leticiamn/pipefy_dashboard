import { describe, expect, it } from 'vitest';
import { aggregate, timeBucket, toNumber } from './aggregate';
import type { CardRecord } from './types';

const card = (over: Partial<CardRecord>): CardRecord => ({
  id: Math.random().toString(36),
  title: 'c',
  phaseId: 'p1',
  phaseName: 'Fase 1',
  createdAt: '2026-01-10T12:00:00Z',
  updatedAt: null,
  finishedAt: null,
  dueDate: null,
  done: false,
  labels: [],
  assignees: [],
  fields: {},
  ...over,
});

const cards: CardRecord[] = [
  card({ phaseId: 'p1', phaseName: 'Fase 1', labels: ['A'], fields: { valor: 100, origem: 'Site' } }),
  card({ phaseId: 'p1', phaseName: 'Fase 1', labels: ['A', 'B'], fields: { valor: 300, origem: 'Site' } }),
  card({
    phaseId: 'p2',
    phaseName: 'Fase 2',
    done: true,
    createdAt: '2026-02-01T00:00:00Z',
    finishedAt: '2026-02-11T00:00:00Z',
    fields: { valor: 50, origem: null },
  }),
];

describe('toNumber', () => {
  it('aceita formatos brasileiro e internacional', () => {
    expect(toNumber('1.234,56')).toBe(1234.56);
    expect(toNumber('1234.56')).toBe(1234.56);
    expect(toNumber('R$ 10,00')).toBe(10);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('timeBucket', () => {
  it('agrupa por mês, dia e semana ISO', () => {
    expect(timeBucket('2026-11-20T10:00:00Z', 'month')).toBe('2026-11');
    expect(timeBucket('2026-11-20T10:00:00Z', 'day')).toBe('2026-11-20');
    expect(timeBucket('2026-01-01T10:00:00Z', 'week')).toBe('2026-W01');
    expect(timeBucket('2027-01-01T10:00:00Z', 'week')).toBe('2026-W53');
  });
});

describe('aggregate', () => {
  it('conta por fase, ordenando do maior para o menor', () => {
    const r = aggregate(cards, { dimension: { kind: 'phase' }, metric: { kind: 'count' }, filters: [] });
    expect(r.rows).toEqual([
      { key: 'p1', label: 'Fase 1', value: 2 },
      { key: 'p2', label: 'Fase 2', value: 1 },
    ]);
    expect(r.total).toBe(3);
    expect(r.cardCount).toBe(3);
  });

  it('soma e média de campo numérico', () => {
    const sum = aggregate(cards, { dimension: { kind: 'phase' }, metric: { kind: 'sum', fieldId: 'valor' }, filters: [] });
    expect(sum.rows.find((r) => r.key === 'p1')?.value).toBe(400);
    const avg = aggregate(cards, { dimension: { kind: 'none' }, metric: { kind: 'avg', fieldId: 'valor' }, filters: [] });
    expect(avg.total).toBe(150);
  });

  it('conta um card em cada etiqueta e marca os sem etiqueta', () => {
    const r = aggregate(cards, { dimension: { kind: 'label' }, metric: { kind: 'count' }, filters: [] });
    expect(Object.fromEntries(r.rows.map((x) => [x.label, x.value]))).toEqual({ A: 2, B: 1, '(vazio)': 1 });
  });

  it('aplica filtros de fase, situação e período', () => {
    const open = aggregate(cards, { dimension: { kind: 'none' }, metric: { kind: 'count' }, filters: [{ kind: 'status', values: ['open'] }] });
    expect(open.total).toBe(2);
    const feb = aggregate(cards, {
      dimension: { kind: 'none' },
      metric: { kind: 'count' },
      filters: [{ kind: 'createdBetween', from: '2026-02-01', to: '2026-02-28' }],
    });
    expect(feb.total).toBe(1);
    const p2 = aggregate(cards, { dimension: { kind: 'none' }, metric: { kind: 'count' }, filters: [{ kind: 'phase', values: ['p2'] }] });
    expect(p2.total).toBe(1);
  });

  it('calcula dias até concluir só com cards concluídos', () => {
    const r = aggregate(cards, { dimension: { kind: 'none' }, metric: { kind: 'avgLeadTimeDays' }, filters: [] });
    expect(r.total).toBe(10);
  });

  it('ordena séries de tempo por período', () => {
    const r = aggregate(cards, { dimension: { kind: 'createdAt', grain: 'month' }, metric: { kind: 'count' }, filters: [] });
    expect(r.rows.map((x) => x.key)).toEqual(['2026-01', '2026-02']);
  });

  it('agrupa o excedente em Outros respeitando o limite', () => {
    const many = Array.from({ length: 10 }, (_, i) => card({ fields: { origem: `O${i}` } }));
    const r = aggregate(many, { dimension: { kind: 'field', fieldId: 'origem' }, metric: { kind: 'count' }, filters: [], limit: 4 });
    expect(r.rows).toHaveLength(4);
    expect(r.rows.at(-1)).toMatchObject({ key: '__others__', value: 7 });
  });

  it('agrupa campo de data por mês', () => {
    const dated = [card({ fields: { data_limite: '2027-05-26' } }), card({ fields: { data_limite: '2027-05-01' } }), card({ fields: { data_limite: '2027-06-10' } }), card({})];
    const r = aggregate(dated, { dimension: { kind: 'field', fieldId: 'data_limite', grain: 'month' }, metric: { kind: 'count' }, filters: [] });
    expect(r.rows).toEqual([
      { key: '2027-05', label: '2027-05', value: 2 },
      { key: '2027-06', label: '2027-06', value: 1 },
    ]);
  });

  it('agrega 20 mil cards rapidamente', async () => {
    const { generateCards } = await import('../mock/generateCards');
    const { mapCard } = await import('../pipefy/mapCard');
    const big = generateCards(20_000).map(mapCard);
    const t = performance.now();
    aggregate(big, { dimension: { kind: 'createdAt', grain: 'week' }, metric: { kind: 'sum', fieldId: 'valor_total' }, filters: [{ kind: 'status', values: ['open'] }] });
    expect(performance.now() - t).toBeLessThan(500);
  });
});
