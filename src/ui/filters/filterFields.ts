import { isComplete } from '../../analytics/filters';
import type { FilterRule, RuleOp } from '../../analytics/types';
import type { FieldMeta } from '../../pipefy/queries';

export const REMOVED_FIELD = '(campo removido)';

export type FilterKind = 'text' | 'number' | 'date' | 'phase' | 'status' | 'list';

export interface FilterField {
  id: string;
  label: string;
  kind: FilterKind;
}

const CARD_FIELDS: FilterField[] = [
  { id: '$title', label: 'Título', kind: 'text' },
  { id: '$phase', label: 'Fase', kind: 'phase' },
  { id: '$status', label: 'Situação', kind: 'status' },
  { id: '$createdAt', label: 'Criado em', kind: 'date' },
  { id: '$finishedAt', label: 'Concluído em', kind: 'date' },
  { id: '$dueDate', label: 'Vencimento', kind: 'date' },
  { id: '$label', label: 'Etiqueta', kind: 'list' },
  { id: '$assignee', label: 'Responsável', kind: 'list' },
];

const SKIPPED_TYPES = new Set(['attachment', 'statement', 'checklist_vertical', 'checklist_horizontal']);
const NUMBER_TYPES = new Set(['number', 'currency']);
const DATE_TYPES = new Set(['date', 'datetime', 'due_date']);

export function buildFilterFields(fields: FieldMeta[]): FilterField[] {
  const pipeFields = fields
    .filter((f) => !SKIPPED_TYPES.has(f.type))
    .map<FilterField>((f) => ({
      id: f.id,
      label: f.label,
      kind: NUMBER_TYPES.has(f.type) ? 'number' : DATE_TYPES.has(f.type) ? 'date' : 'text',
    }));
  return [...CARD_FIELDS, ...pipeFields];
}

export const OPS: Record<FilterKind, Array<[RuleOp, string]>> = {
  text: [
    ['contains', 'contém'],
    ['not_contains', 'não contém'],
    ['eq', 'é igual a'],
    ['neq', 'é diferente de'],
    ['is_set', 'está preenchido'],
    ['not_set', 'está vazio'],
  ],
  number: [
    ['eq', '='],
    ['neq', '≠'],
    ['gt', '>'],
    ['gte', '≥'],
    ['lt', '<'],
    ['lte', '≤'],
    ['between', 'entre'],
    ['is_set', 'está preenchido'],
    ['not_set', 'está vazio'],
  ],
  date: [
    ['eq', 'no dia'],
    ['lt', 'antes de'],
    ['gt', 'depois de'],
    ['between', 'entre'],
    ['is_set', 'está preenchido'],
    ['not_set', 'está vazio'],
  ],
  phase: [
    ['in', 'é uma de'],
    ['neq', 'não é'],
  ],
  status: [['eq', 'é']],
  list: [
    ['eq', 'inclui'],
    ['neq', 'não inclui'],
    ['contains', 'contém o texto'],
    ['is_set', 'tem algum'],
    ['not_set', 'não tem'],
  ],
};

export const STATUS_OPTIONS: Array<[string, string]> = [
  ['open', 'Em aberto'],
  ['done', 'Concluído'],
];

export const newRule = (field: FilterField): FilterRule => ({
  kind: 'rule',
  field: field.id,
  op: OPS[field.kind][0][0],
});

/** Ignora regras sem valor e as de campos que não existem mais no pipe. */
export const usableRules = (rules: FilterRule[], known: ReadonlySet<string>): FilterRule[] =>
  rules.filter((r) => isComplete(r) && known.has(r.field));

type Phase = { id: string; name: string };

function describeValue(rule: FilterRule, field: FilterField, phases: Phase[]): string {
  const show = (v = '') => {
    if (field.kind === 'phase') return phases.find((p) => p.id === v)?.name ?? v;
    if (field.kind === 'status') return STATUS_OPTIONS.find(([id]) => id === v)?.[1] ?? v;
    if (field.kind === 'date' && v) return v.split('-').reverse().join('/');
    return v;
  };
  if (rule.op === 'between') return `${show(rule.value) || '…'} e ${show(rule.value2) || '…'}`;
  return (rule.value ?? '').split(',').filter(Boolean).map(show).join(', ');
}

/** Texto curto de uma regra para os chips do painel, ex.: "Situação é Em aberto". */
export function describeRule(rule: FilterRule, fields: FilterField[], phases: Phase[]): string {
  const field = fields.find((f) => f.id === rule.field);
  if (!field) return REMOVED_FIELD;
  const op = OPS[field.kind].find(([id]) => id === rule.op)?.[1] ?? rule.op;
  return [field.label, op, describeValue(rule, field, phases)].filter(Boolean).join(' ');
}
