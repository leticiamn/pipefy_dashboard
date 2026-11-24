import { localDay } from '../lib/dates';
import { toNumber } from '../lib/parse';
import type { CardRecord, FilterRule, RuleOp } from './types';

type RawValue = string | number | string[] | null;

export const NO_VALUE_OPS: ReadonlySet<RuleOp> = new Set(['is_set', 'not_set']);

export function cardValue(card: CardRecord, field: string): RawValue {
  switch (field) {
    case '$title':
      return card.title;
    case '$phase':
      return card.phaseId;
    case '$status':
      return card.done ? 'done' : 'open';
    case '$createdAt':
      return card.createdAt;
    case '$finishedAt':
      return card.finishedAt;
    case '$dueDate':
      return card.dueDate;
    case '$label':
      return card.labels;
    case '$assignee':
      return card.assignees;
    default:
      return card.fields[field] ?? null;
  }
}

const isEmpty = (v: RawValue) => v === null || v === '' || (Array.isArray(v) && v.length === 0);
const norm = (v: string) => v.trim().toLowerCase();
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}/.test(v);

/** Números comparam como número; datas pelo dia no fuso dado (AAAA-MM-DD); o resto como texto sem caixa. */
function compare(actual: string | number, expected: string, timeZone: string): number | null {
  if (typeof actual === 'number') {
    const n = toNumber(expected);
    return n === null ? null : actual - n;
  }
  if (isIsoDate(actual) && isIsoDate(expected))
    return (localDay(actual, timeZone) ?? '').localeCompare(expected.slice(0, 10));
  return norm(actual).localeCompare(norm(expected));
}

function matchScalar(actual: string | number, rule: FilterRule, timeZone: string): boolean {
  const value = rule.value ?? '';
  const cmp = (expected: string) => compare(actual, expected, timeZone);
  switch (rule.op) {
    case 'eq':
      return cmp(value) === 0;
    case 'neq':
      return cmp(value) !== 0;
    case 'contains':
      return norm(String(actual)).includes(norm(value));
    case 'not_contains':
      return !norm(String(actual)).includes(norm(value));
    case 'gt':
      return (cmp(value) ?? -1) > 0;
    case 'gte':
      return (cmp(value) ?? -1) >= 0;
    case 'lt':
      return (cmp(value) ?? 1) < 0;
    case 'lte':
      return (cmp(value) ?? 1) <= 0;
    case 'between': {
      const from = value ? cmp(value) : 0;
      const to = rule.value2 ? cmp(rule.value2) : 0;
      return from !== null && to !== null && from >= 0 && to <= 0;
    }
    case 'in':
      return value.split(',').some((v) => cmp(v) === 0);
    default:
      return true;
  }
}

/** Regra incompleta (sem valor) não filtra nada: o painel não some enquanto o usuário digita. */
export function isComplete(rule: FilterRule): boolean {
  if (NO_VALUE_OPS.has(rule.op)) return true;
  if (rule.op === 'between') return Boolean(rule.value || rule.value2);
  return Boolean(rule.value);
}

export function matchesRule(card: CardRecord, rule: FilterRule, timeZone: string): boolean {
  if (!isComplete(rule)) return true;
  const actual = cardValue(card, rule.field);
  if (rule.op === 'is_set') return !isEmpty(actual);
  if (rule.op === 'not_set') return isEmpty(actual);
  if (Array.isArray(actual)) {
    const negative = rule.op === 'neq' || rule.op === 'not_contains';
    if (!actual.length) return negative;
    const positive: FilterRule = negative ? { ...rule, op: rule.op === 'neq' ? 'eq' : 'contains' } : rule;
    const hit = actual.some((v) => matchScalar(v, positive, timeZone));
    return negative ? !hit : hit;
  }
  if (actual === null || actual === '') return rule.op === 'neq' || rule.op === 'not_contains';
  return matchScalar(actual, rule, timeZone);
}

const OPS: ReadonlySet<string> = new Set<RuleOp>([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'is_set',
  'not_set',
]);

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null;
const optionalText = (v: unknown) => v === undefined || typeof v === 'string';
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function isRule(v: Raw): v is Raw & FilterRule {
  return (
    v.kind === 'rule' &&
    typeof v.field === 'string' &&
    v.field !== '' &&
    OPS.has(v.op as string) &&
    optionalText(v.value) &&
    optionalText(v.value2)
  );
}

/** Formatos gravados por versões anteriores do editor de visão. */
function fromLegacy(v: Raw): FilterRule | null {
  const values = texts(v.values);
  if (v.kind === 'status' && values.length === 1) return { kind: 'rule', field: '$status', op: 'eq', value: values[0] };
  if (v.kind === 'phase' && values.length) return { kind: 'rule', field: '$phase', op: 'in', value: values.join(',') };
  if (v.kind === 'createdBetween' && (typeof v.from === 'string' || typeof v.to === 'string')) {
    return { kind: 'rule', field: '$createdAt', op: 'between', value: texts([v.from])[0], value2: texts([v.to])[0] };
  }
  return null;
}

/** Valida filtros lidos do armazenamento: converte os formatos antigos e descarta o que não reconhece. */
export function parseFilters(raw: unknown): FilterRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (!isRaw(v)) return [];
    if (isRule(v)) return [{ kind: 'rule', field: v.field, op: v.op, value: v.value, value2: v.value2 }];
    const legacy = fromLegacy(v);
    return legacy ? [legacy] : [];
  });
}
