import {
  type AggregateResult,
  type AggregateRow,
  type CardRecord,
  type Dimension,
  type Filter,
  type Metric,
  type TimeGrain,
  type ViewConfig,
  EMPTY_LABEL,
  OTHERS_KEY,
} from './types';

const DAY_MS = 86_400_000;

/** Converte um valor de campo em número, aceitando "1.234,56" e "1234.56". */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/[^\d,.-]/g, '');
  if (!raw) return null;
  const normalized =
    raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Chave de período em UTC: 2026-11-20 (dia), 2026-W47 (semana ISO) ou 2026-11 (mês). */
export function timeBucket(iso: string, grain: TimeGrain): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (grain === 'month') return `${y}-${m}`;
  if (grain === 'day') return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`;
  // Semana ISO 8601
  const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function fieldKey(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

/** Chaves de um card para a dimensão. Etiquetas e responsáveis podem gerar várias. */
export function dimensionKeys(card: CardRecord, dim: Dimension): Array<[key: string, label: string]> {
  switch (dim.kind) {
    case 'none':
      return [['all', 'Total']];
    case 'phase':
      return [[card.phaseId, card.phaseName]];
    case 'status':
      return card.done ? [['done', 'Concluído']] : [['open', 'Em aberto']];
    case 'label':
      return card.labels.length ? card.labels.map((l) => [l, l]) : [['', EMPTY_LABEL]];
    case 'assignee':
      return card.assignees.length ? card.assignees.map((a) => [a, a]) : [['', EMPTY_LABEL]];
    case 'field': {
      const raw = fieldKey(card.fields[dim.fieldId]);
      if (dim.grain) {
        const k = raw ? timeBucket(raw, dim.grain) : '';
        return k ? [[k, k]] : [];
      }
      return [[raw, raw || EMPTY_LABEL]];
    }
    case 'createdAt': {
      const k = timeBucket(card.createdAt, dim.grain);
      return k ? [[k, k]] : [];
    }
    case 'finishedAt': {
      if (!card.finishedAt) return [];
      const k = timeBucket(card.finishedAt, dim.grain);
      return k ? [[k, k]] : [];
    }
  }
}

export function matchesFilters(card: CardRecord, filters: Filter[]): boolean {
  for (const f of filters) {
    switch (f.kind) {
      case 'phase':
        if (f.values.length && !f.values.includes(card.phaseId)) return false;
        break;
      case 'label':
        if (f.values.length && !card.labels.some((l) => f.values.includes(l))) return false;
        break;
      case 'assignee':
        if (f.values.length && !card.assignees.some((a) => f.values.includes(a))) return false;
        break;
      case 'status':
        if (f.values.length && !f.values.includes(card.done ? 'done' : 'open')) return false;
        break;
      case 'field':
        if (f.values.length && !f.values.includes(fieldKey(card.fields[f.fieldId]))) return false;
        break;
      case 'createdBetween': {
        const t = Date.parse(card.createdAt);
        if (f.from && t < Date.parse(f.from)) return false;
        if (f.to && t >= Date.parse(f.to) + DAY_MS) return false;
        break;
      }
    }
  }
  return true;
}

/** Acumulador de uma métrica: soma e quantidade de valores válidos. */
interface Acc {
  sum: number;
  n: number;
}

function metricSample(card: CardRecord, metric: Metric): number | null {
  switch (metric.kind) {
    case 'count':
      return 1;
    case 'sum':
    case 'avg':
      return toNumber(card.fields[metric.fieldId]);
    case 'avgLeadTimeDays': {
      if (!card.finishedAt) return null;
      const ms = Date.parse(card.finishedAt) - Date.parse(card.createdAt);
      return Number.isFinite(ms) && ms >= 0 ? ms / DAY_MS : null;
    }
  }
}

function finish(acc: Acc, metric: Metric): number {
  if (metric.kind === 'avg' || metric.kind === 'avgLeadTimeDays') {
    return acc.n ? round(acc.sum / acc.n) : 0;
  }
  return round(acc.sum);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const isTimeDimension = (d: Dimension) =>
  d.kind === 'createdAt' || d.kind === 'finishedAt' || (d.kind === 'field' && Boolean(d.grain));

/** Agrega os cards conforme a configuração de uma visão. Função pura, roda no Web Worker. */
export function aggregate(cards: Iterable<CardRecord>, view: Pick<ViewConfig, 'dimension' | 'metric' | 'filters' | 'limit'>): AggregateResult {
  const groups = new Map<string, { label: string; acc: Acc }>();
  const total: Acc = { sum: 0, n: 0 };
  let cardCount = 0;

  for (const card of cards) {
    if (!matchesFilters(card, view.filters)) continue;
    cardCount++;
    const sample = metricSample(card, view.metric);
    if (sample !== null) {
      total.sum += sample;
      total.n++;
    }
    for (const [key, label] of dimensionKeys(card, view.dimension)) {
      let g = groups.get(key);
      if (!g) {
        g = { label, acc: { sum: 0, n: 0 } };
        groups.set(key, g);
      }
      if (sample !== null) {
        g.acc.sum += sample;
        g.acc.n++;
      }
    }
  }

  let rows: AggregateRow[] = [...groups.entries()].map(([key, g]) => ({
    key,
    label: g.label,
    value: finish(g.acc, view.metric),
  }));

  if (isTimeDimension(view.dimension)) {
    rows.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const limit = view.limit ?? 0;
    if (limit > 0 && rows.length > limit) {
      const kept = rows.slice(0, limit - 1);
      const restKeys = new Set(rows.slice(limit - 1).map((r) => r.key));
      // "Outros" é recalculado a partir dos grupos, para média continuar correta.
      const rest: Acc = { sum: 0, n: 0 };
      for (const [key, g] of groups) {
        if (restKeys.has(key)) {
          rest.sum += g.acc.sum;
          rest.n += g.acc.n;
        }
      }
      rows = [...kept, { key: OTHERS_KEY, label: `Outros (${restKeys.size})`, value: finish(rest, view.metric) }];
    }
  }

  return { rows, total: finish(total, view.metric), cardCount };
}
