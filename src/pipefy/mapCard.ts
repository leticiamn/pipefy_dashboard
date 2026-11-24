import { toNumber } from '../analytics/aggregate';
import type { CardRecord } from '../analytics/types';
import type { FieldMeta, PipeMetaResponse, RawCard } from './queries';

const NUMERIC_TYPES = new Set(['number', 'currency']);
const DATE_TYPES = new Set(['date', 'datetime', 'due_date']);

/** Versão do formato do card no cache. Mudou o mapeamento? Suba o número e o cache é recarregado. */
export const CARD_FORMAT = 2;

/**
 * Converte data do Pipefy para ISO. O valor do campo vem como "26/05/2027" ou "26/05/2027 14:30";
 * aceita também valores já em ISO. Datas sem hora ficam como "2027-05-26".
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return hh ? `${date}T${hh.padStart(2, '0')}:${mm}:00` : date;
  }
  return Number.isNaN(Date.parse(v)) ? null : v;
}

/** Converte o card da API no formato do cache. */
export function mapCard(raw: RawCard): CardRecord {
  const fields: CardRecord['fields'] = {};
  for (const f of raw.fields ?? []) {
    if (!f?.field?.id) continue;
    const type = f.field.type;
    fields[f.field.id] = NUMERIC_TYPES.has(type) ? toNumber(f.value) : DATE_TYPES.has(type) ? toIsoDate(f.value) : (f.value ?? null);
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

/** Campos do pipe (formulário inicial e fases), sem repetição, para o construtor de visões. */
export function pipeFields(meta: PipeMetaResponse['pipe']): FieldMeta[] {
  const seen = new Map<string, FieldMeta>();
  for (const f of meta.start_form_fields ?? []) seen.set(f.id, f);
  for (const phase of meta.phases) for (const f of phase.fields ?? []) if (!seen.has(f.id)) seen.set(f.id, f);
  return [...seen.values()];
}

export const isNumericField = (f: FieldMeta) => NUMERIC_TYPES.has(f.type);
export const isDateField = (f: FieldMeta) => DATE_TYPES.has(f.type);

/** Campos que não fazem sentido como categoria de gráfico. */
const NOT_GROUPABLE = new Set(['long_text', 'attachment', 'checklist_vertical', 'checklist_horizontal', 'statement', 'number', 'currency', 'email', 'id']);

export const isGroupableField = (f: FieldMeta) => !NOT_GROUPABLE.has(f.type) && !DATE_TYPES.has(f.type);
