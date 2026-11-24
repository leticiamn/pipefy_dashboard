import type { CardRecord } from '../analytics/types';
import { toIsoDate, toNumber } from '../lib/parse';
import type { FieldMeta, PipeMetaResponse, RawCard } from './queries';

const NUMERIC_TYPES = new Set(['number', 'currency']);
const DATE_TYPES = new Set(['date', 'datetime', 'due_date']);

/** Suba quando o mapeamento mudar: o cache de cada usuário é recarregado. */
export const CARD_FORMAT = 2;

function fieldValue(type: string, value: string | null): string | number | null {
  if (NUMERIC_TYPES.has(type)) return toNumber(value);
  if (DATE_TYPES.has(type)) return toIsoDate(value);
  return value ?? null;
}

export function mapCard(raw: RawCard): CardRecord {
  const fields: CardRecord['fields'] = {};
  for (const f of raw.fields ?? []) {
    if (!f?.field?.id) continue;
    fields[f.field.id] = fieldValue(f.field.type, f.value);
  }
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    phaseId: raw.current_phase?.id ?? '',
    phaseName: raw.current_phase?.name ?? '',
    createdAt: raw.createdAt,
    updatedAt: raw.updated_at ?? null,
    finishedAt: raw.finished_at ?? null,
    dueDate: raw.due_date ?? null,
    done: Boolean(raw.done),
    labels: (raw.labels ?? []).map((l) => l.name),
    assignees: (raw.assignees ?? []).map((a) => a.name),
    fields,
  };
}

export function pipeFields(meta: PipeMetaResponse['pipe']): FieldMeta[] {
  const seen = new Map<string, FieldMeta>();
  for (const f of meta.start_form_fields ?? []) seen.set(f.id, f);
  for (const phase of meta.phases) for (const f of phase.fields ?? []) if (!seen.has(f.id)) seen.set(f.id, f);
  return [...seen.values()];
}

export const isNumericField = (f: FieldMeta) => NUMERIC_TYPES.has(f.type);
export const isDateField = (f: FieldMeta) => DATE_TYPES.has(f.type);

const NOT_GROUPABLE = new Set([
  'long_text',
  'attachment',
  'checklist_vertical',
  'checklist_horizontal',
  'statement',
  'number',
  'currency',
  'email',
  'id',
]);

export const isGroupableField = (f: FieldMeta) => !NOT_GROUPABLE.has(f.type) && !DATE_TYPES.has(f.type);
