import { describe, expect, it } from 'vitest';
import { aggregate, timeBucket } from './aggregate';
import type { CardRecord } from './types';

const TZ = 'America/Sao_Paulo';
const run = (cards: CardRecord[], view: Parameters<typeof aggregate>[1]) => aggregate(cards, view, TZ);
const bucket = (value: string, grain: Parameters<typeof timeBucket>[1]) => timeBucket(value, grain, TZ);

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
    createdAt: '2026-02-01T12:00:00Z',
    finishedAt: '2026-02-11T12:00:00Z',
    fields: { valor: 50, origem: null },
  }),
];

describe('timeBucket', () => {
  it('agrupa por mês, dia e semana ISO no fuso do perfil', () => {
    expect(bucket('2026-12-01T01:00:00Z', 'month')).toBe('2026-11');
    expect(bucket('2027-05-26', 'day')).toBe('2027-05-26');
    expect(bucket('2026-11-20T10:00:00Z', 'month')).toBe('2026-11');
    expect(bucket('2026-11-20T10:00:00Z', 'day')).toBe('2026-11-20');
    expect(bucket('2026-01-01T10:00:00Z', 'week')).toBe('2026-W01');
    expect(bucket('2027-01-01T10:00:00Z', 'week')).toBe('2026-W53');
  });
});

describe('aggregate', () => {
  it('conta por fase, ordenando do maior para o menor', () => {
    const r = run(cards, { dimension: { kind: 'phase' }, metric: { kind: 'count' }, filters: [] });
    expect(r.rows).toEqual([
      { key: 'p1', label: 'Fase 1', value: 2 },
      { key: 'p2', label: 'Fase 2', value: 1 },
    ]);
    expect(r.total).toBe(3);
    expect(r.cardCount).toBe(3);
  });

  it('soma e média de campo numérico', () => {
    const sum = run(cards, {
      dimension: { kind: 'phase' },
      metric: { kind: 'sum', fieldId: 'valor' },
      filters: [],
    });
    expect(sum.rows.find((r) => r.key === 'p1')?.value).toBe(400);
    const avg = run(cards, {
      dimension: { kind: 'none' },
      metric: { kind: 'avg', fieldId: 'valor' },
      filters: [],
    });
    expect(avg.total).toBe(150);
  });

  it('conta um card em cada etiqueta e marca os sem etiqueta', () => {
    const r = run(cards, { dimension: { kind: 'label' }, metric: { kind: 'count' }, filters: [] });
    expect(Object.fromEntries(r.rows.map((x) => [x.label, x.value]))).toEqual({ A: 2, B: 1, '(vazio)': 1 });
  });

  it('aplica filtros de fase, situação e período', () => {
    const open = run(cards, {
      dimension: { kind: 'none' },
      metric: { kind: 'count' },
      filters: [{ kind: 'rule', field: '$status', op: 'eq', value: 'open' }],
    });
    expect(open.total).toBe(2);
    const feb = run(cards, {
      dimension: { kind: 'none' },
      metric: { kind: 'count' },
      filters: [{ kind: 'rule', field: '$createdAt', op: 'between', value: '2026-02-01', value2: '2026-02-28' }],
    });
    expect(feb.total).toBe(1);
    const p2 = run(cards, {
      dimension: { kind: 'none' },
      metric: { kind: 'count' },
      filters: [{ kind: 'rule', field: '$phase', op: 'in', value: 'p2' }],
    });
    expect(p2.total).toBe(1);
  });

  it('calcula dias até concluir só com cards concluídos', () => {
    const r = run(cards, { dimension: { kind: 'none' }, metric: { kind: 'avgLeadTimeDays' }, filters: [] });
    expect(r.total).toBe(10);
  });

  it('ordena séries de tempo por período', () => {
    const r = run(cards, {
      dimension: { kind: 'createdAt', grain: 'month' },
      metric: { kind: 'count' },
      filters: [],
    });
    expect(r.rows.map((x) => x.key)).toEqual(['2026-01', '2026-02']);
  });

  it('agrupa o excedente em Outros respeitando o limite', () => {
    const many = Array.from({ length: 10 }, (_, i) => card({ fields: { origem: `O${i}` } }));
    const r = run(many, {
      dimension: { kind: 'field', fieldId: 'origem' },
      metric: { kind: 'count' },
      filters: [],
      limit: 4,
    });
    expect(r.rows).toHaveLength(4);
    expect(r.rows.at(-1)).toMatchObject({ key: '__others__', value: 7 });
  });

  it('agrupa campo de data por mês', () => {
    const dated = [
      card({ fields: { data_limite: '2027-05-26' } }),
      card({ fields: { data_limite: '2027-05-01' } }),
      card({ fields: { data_limite: '2027-06-10' } }),
      card({}),
    ];
    const r = run(dated, {
      dimension: { kind: 'field', fieldId: 'data_limite', grain: 'month' },
      metric: { kind: 'count' },
      filters: [],
    });
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
    run(big, {
      dimension: { kind: 'createdAt', grain: 'week' },
      metric: { kind: 'sum', fieldId: 'valor_total' },
      filters: [{ kind: 'rule', field: '$status', op: 'eq', value: 'open' }],
    });
    expect(performance.now() - t).toBeLessThan(500);
  });
});
