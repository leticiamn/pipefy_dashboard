import { describe, expect, it } from 'vitest';
import { matchesRule, parseFilters } from './filters';
import type { CardRecord, FilterRule, RuleOp } from './types';

const matches = (c: CardRecord, r: FilterRule) => matchesRule(c, r, 'America/Sao_Paulo');

const card: CardRecord = {
  id: '1',
  title: 'Pedido Acme',
  phaseId: 'p1',
  phaseName: 'Fase 1',
  createdAt: '2026-11-13T10:00:00Z',
  updatedAt: null,
  finishedAt: null,
  dueDate: null,
  done: false,
  labels: ['Urgente'],
  assignees: [],
  fields: { valor_total: 1500.5, estado: 'RS', data_limite: '2027-05-26', email: null },
};

const rule = (field: string, op: RuleOp, value?: string, value2?: string): FilterRule => ({
  kind: 'rule',
  field,
  op,
  value,
  value2,
});

describe('matchesRule', () => {
  it('compara texto sem diferenciar maiúsculas', () => {
    expect(matches(card, rule('estado', 'eq', 'rs'))).toBe(true);
    expect(matches(card, rule('estado', 'neq', 'SP'))).toBe(true);
    expect(matches(card, rule('$title', 'contains', 'acme'))).toBe(true);
    expect(matches(card, rule('$title', 'not_contains', 'acme'))).toBe(false);
  });

  it('compara números', () => {
    expect(matches(card, rule('valor_total', 'gt', '1000'))).toBe(true);
    expect(matches(card, rule('valor_total', 'lte', '1.000,00'))).toBe(false);
    expect(matches(card, rule('valor_total', 'between', '1000', '2000'))).toBe(true);
  });

  it('compara datas pelo dia', () => {
    expect(matches(card, rule('$createdAt', 'eq', '2026-11-13'))).toBe(true);
    expect(matches({ ...card, createdAt: '2026-11-14T01:30:00Z' }, rule('$createdAt', 'eq', '2026-11-13'))).toBe(true);
    expect(matches(card, rule('data_limite', 'lt', '2027-06-01'))).toBe(true);
    expect(matches(card, rule('data_limite', 'between', '2027-01-01', ''))).toBe(true);
  });

  it('trata campo vazio e listas', () => {
    expect(matches(card, rule('email', 'not_set'))).toBe(true);
    expect(matches(card, rule('email', 'eq', 'a@b.com'))).toBe(false);
    expect(matches(card, rule('$label', 'eq', 'urgente'))).toBe(true);
    expect(matches(card, rule('$assignee', 'is_set'))).toBe(false);
    expect(matches(card, rule('$phase', 'in', 'p2,p1'))).toBe(true);
    expect(matches(card, rule('$status', 'eq', 'done'))).toBe(false);
  });

  it('ignora regra sem valor', () => {
    expect(matches(card, rule('estado', 'eq', ''))).toBe(true);
  });
});

describe('parseFilters', () => {
  it('mantém regras válidas e descarta as corrompidas', () => {
    const raw = [
      { kind: 'rule', field: 'estado', op: 'eq', value: 'RS' },
      { kind: 'rule', field: 'estado', op: 'apagar', value: 'RS' },
      { kind: 'rule', field: '', op: 'eq' },
      { kind: 'rule', field: 'estado', op: 'eq', value: 42 },
      null,
      'texto',
    ];
    expect(parseFilters(raw)).toEqual([{ kind: 'rule', field: 'estado', op: 'eq', value: 'RS', value2: undefined }]);
    expect(parseFilters('não é lista')).toEqual([]);
  });

  it('converte filtros do formato antigo', () => {
    expect(
      parseFilters([
        { kind: 'status', values: ['open'] },
        { kind: 'phase', values: ['p1', 'p2'] },
        { kind: 'createdBetween', from: '2026-01-01' },
        { kind: 'label', values: ['A'] },
      ]),
    ).toEqual([
      { kind: 'rule', field: '$status', op: 'eq', value: 'open' },
      { kind: 'rule', field: '$phase', op: 'in', value: 'p1,p2' },
      { kind: 'rule', field: '$createdAt', op: 'between', value: '2026-01-01', value2: undefined },
    ]);
  });
});
