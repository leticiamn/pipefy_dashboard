import type { Dimension, Metric, ViewConfig } from '../analytics/types';
import { isDateField, isGroupableField, isNumericField } from '../pipefy/mapCard';
import type { FieldMeta } from '../pipefy/queries';
import type { DashboardConfig, LayoutItem } from './types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function prefer(fields: FieldMeta[], terms: string[]): FieldMeta | undefined {
  for (const term of terms) {
    const hit = fields.find((f) => normalize(f.label).includes(term));
    if (hit) return hit;
  }
  return undefined;
}

export function defaultDashboard(fields: FieldMeta[] = []): DashboardConfig {
  const numeric = fields.filter(isNumericField);
  const groupable = fields.filter(isGroupableField);
  const num = prefer(numeric, ['valor', 'total', 'preco', 'amount']) ?? numeric[0];
  const date = prefer(fields.filter(isDateField), ['limite', 'prazo', 'data']) ?? fields.find(isDateField);
  const catA = prefer(groupable, ['estado', 'uf', 'regiao', 'pais']) ?? groupable[0];
  const catB =
    prefer(
      groupable.filter((f) => f !== catA),
      ['cidade', 'origem', 'categoria', 'tipo'],
    ) ?? groupable.find((f) => f !== catA);
  const catC = prefer(
    groupable.filter((f) => f !== catA && f !== catB),
    ['empresa', 'cliente', 'conta'],
  );

  const views: ViewConfig[] = [];
  const layout: LayoutItem[] = [];
  const add = (view: ViewConfig, pos: Omit<LayoutItem, 'i'>) => {
    views.push(view);
    layout.push({ i: view.id, ...pos });
  };
  const count: Metric = { kind: 'count' };
  const sum: Metric = num ? { kind: 'sum', fieldId: num.id } : count;

  add(
    { id: 'v-total', title: 'Total de cards', chart: 'kpi', dimension: { kind: 'none' }, metric: count, filters: [] },
    { x: 0, y: 0, w: 3, h: 2 },
  );
  if (num) {
    add(
      {
        id: 'v-sum',
        title: `${num.label} (soma)`,
        chart: 'kpi',
        dimension: { kind: 'none' },
        metric: sum,
        filters: [],
      },
      { x: 3, y: 0, w: 3, h: 2 },
    );
    add(
      {
        id: 'v-avg',
        title: `${num.label} (média por card)`,
        chart: 'kpi',
        dimension: { kind: 'none' },
        metric: { kind: 'avg', fieldId: num.id },
        filters: [],
      },
      { x: 6, y: 0, w: 3, h: 2 },
    );
  } else {
    add(
      {
        id: 'v-open',
        title: 'Cards em aberto',
        chart: 'kpi',
        dimension: { kind: 'none' },
        metric: count,
        filters: [{ kind: 'rule', field: '$status', op: 'eq', value: 'open' }],
      },
      { x: 3, y: 0, w: 3, h: 2 },
    );
    add(
      {
        id: 'v-done',
        title: 'Cards concluídos',
        chart: 'kpi',
        dimension: { kind: 'none' },
        metric: count,
        filters: [{ kind: 'rule', field: '$status', op: 'eq', value: 'done' }],
      },
      { x: 6, y: 0, w: 3, h: 2 },
    );
  }
  add(
    {
      id: 'v-lead',
      title: 'Tempo médio até concluir',
      chart: 'kpi',
      dimension: { kind: 'none' },
      metric: { kind: 'avgLeadTimeDays' },
      filters: [],
    },
    { x: 9, y: 0, w: 3, h: 2 },
  );

  const byA: Dimension = catA ? { kind: 'field', fieldId: catA.id } : { kind: 'phase' };
  add(
    {
      id: 'v-by-a',
      title: num ? `${num.label} por ${catA?.label ?? 'fase'}` : `Cards por ${catA?.label ?? 'fase'}`,
      chart: 'bar',
      dimension: byA,
      metric: sum,
      filters: [],
      limit: 15,
    },
    { x: 0, y: 2, w: 6, h: 5 },
  );
  const time: Dimension = date
    ? { kind: 'field', fieldId: date.id, grain: 'month' }
    : { kind: 'createdAt', grain: 'month' };
  add(
    {
      id: 'v-time',
      title: date ? `Cards por mês de ${date.label}` : 'Cards criados por mês',
      chart: 'line',
      dimension: time,
      metric: count,
      filters: [],
    },
    { x: 6, y: 2, w: 6, h: 5 },
  );
  if (catC) {
    add(
      {
        id: 'v-top-c',
        title: `Top 10 ${catC.label} por ${num?.label ?? 'cards'}`,
        chart: 'table',
        dimension: { kind: 'field', fieldId: catC.id },
        metric: sum,
        filters: [],
        limit: 11,
      },
      { x: 0, y: 7, w: 5, h: 6 },
    );
  }
  if (catB) {
    add(
      {
        id: 'v-by-b',
        title: `Cards por ${catB.label}`,
        chart: 'bar',
        dimension: { kind: 'field', fieldId: catB.id },
        metric: count,
        filters: [],
        limit: 12,
      },
      { x: catC ? 5 : 0, y: 7, w: catC ? 7 : 8, h: 6 },
    );
  }
  add(
    {
      id: 'v-funnel',
      title: 'Funil por fase',
      chart: 'funnel',
      dimension: { kind: 'phase' },
      metric: count,
      filters: [],
    },
    { x: 0, y: 13, w: num ? 6 : 12, h: 5 },
  );
  if (num) {
    add(
      {
        id: 'v-sum-phase',
        title: `${num.label} por fase`,
        chart: 'bar',
        dimension: { kind: 'phase' },
        metric: sum,
        filters: [],
      },
      { x: 6, y: 13, w: 6, h: 5 },
    );
  }
  const avgByA = Boolean(num && catA);
  add(
    {
      id: 'v-done-month',
      title: 'Cards concluídos por mês',
      chart: 'line',
      dimension: { kind: 'finishedAt', grain: 'month' },
      metric: count,
      filters: [],
    },
    { x: 0, y: 18, w: avgByA ? 6 : 12, h: 5 },
  );
  if (num && catA) {
    add(
      {
        id: 'v-avg-a',
        title: `${num.label} médio por ${catA.label}`,
        chart: 'bar',
        dimension: { kind: 'field', fieldId: catA.id },
        metric: { kind: 'avg', fieldId: num.id },
        filters: [],
        limit: 15,
      },
      { x: 6, y: 18, w: 6, h: 5 },
    );
  }

  return { version: 1, views, layout, filters: [] };
}
