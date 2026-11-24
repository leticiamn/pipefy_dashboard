import {
  type AggregateResult,
  type AggregateRow,
  type CardRecord,
  type Dimension,
  type FilterRule,
  type Metric,
  type TimeGrain,
  type ViewConfig,
  EMPTY_LABEL,
  OTHERS_KEY,
} from './types';
import { isoWeek, localDay } from '../lib/dates';
import { toNumber } from '../lib/parse';
import { matchesRule } from './filters';

const DAY_MS = 86_400_000;

/** No fuso dado: 2026-11-20 (dia), 2026-W47 (semana ISO) ou 2026-11 (mês). */
export function timeBucket(value: string, grain: TimeGrain, timeZone: string): string {
  const day = localDay(value, timeZone);
  if (!day) return '';
  if (grain === 'day') return day;
  if (grain === 'month') return day.slice(0, 7);
  return isoWeek(day);
}

function fieldKey(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

export function dimensionKeys(card: CardRecord, dim: Dimension, timeZone: string): Array<[key: string, label: string]> {
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
        const k = raw ? timeBucket(raw, dim.grain, timeZone) : '';
        return k ? [[k, k]] : [];
      }
      return [[raw, raw || EMPTY_LABEL]];
    }
    case 'createdAt': {
      const k = timeBucket(card.createdAt, dim.grain, timeZone);
      return k ? [[k, k]] : [];
    }
    case 'finishedAt': {
      if (!card.finishedAt) return [];
      const k = timeBucket(card.finishedAt, dim.grain, timeZone);
      return k ? [[k, k]] : [];
    }
  }
}

export const matchesFilters = (card: CardRecord, filters: FilterRule[], timeZone: string): boolean =>
  filters.every((rule) => matchesRule(card, rule, timeZone));

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

export function aggregate(
  cards: Iterable<CardRecord>,
  view: Pick<ViewConfig, 'dimension' | 'metric' | 'filters' | 'limit'>,
  timeZone: string,
): AggregateResult {
  const groups = new Map<string, { label: string; acc: Acc }>();
  const total: Acc = { sum: 0, n: 0 };
  let cardCount = 0;

  for (const card of cards) {
    if (!matchesFilters(card, view.filters, timeZone)) continue;
    cardCount++;
    const sample = metricSample(card, view.metric);
    if (sample !== null) {
      total.sum += sample;
      total.n++;
    }
    for (const [key, label] of dimensionKeys(card, view.dimension, timeZone)) {
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
      // Recalculado a partir dos grupos para a média de "Outros" continuar correta.
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
