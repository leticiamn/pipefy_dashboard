import type { Dimension, Metric, ViewConfig } from '../analytics/types';
import { isDateField, isGroupableField, isNumericField } from '../pipefy/mapCard';
import type { FieldMeta } from '../pipefy/queries';
import type { DashboardDb } from '../data/db';
import type { PipefyClient } from '../pipefy/sdk';

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardConfig {
  version: 1;
  views: ViewConfig[];
  layout: LayoutItem[];
}

const KEY = 'dashboard:v2';

/** Escolhe o primeiro campo cujo nome contém um dos termos, na ordem de preferência. */
function prefer(fields: FieldMeta[], terms: string[]): FieldMeta | undefined {
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const term of terms) {
    const hit = fields.find((f) => norm(f.label).includes(term));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Painel inicial montado a partir dos campos do pipe: KPIs do primeiro campo numérico,
 * agrupamentos pelos campos de categoria mais comuns e série no tempo pelo campo de data.
 * Funciona com qualquer pipe; o usuário edita tudo depois.
 */
export function defaultDashboard(fields: FieldMeta[] = []): DashboardConfig {
  const numeric = fields.filter(isNumericField);
  const groupable = fields.filter(isGroupableField);
  const num = prefer(numeric, ['valor', 'total', 'preco', 'amount']) ?? numeric[0];
  const date = prefer(fields.filter(isDateField), ['limite', 'prazo', 'data']) ?? fields.find(isDateField);
  const catA = prefer(groupable, ['estado', 'uf', 'regiao', 'pais']) ?? groupable[0];
  const catB = prefer(groupable.filter((f) => f !== catA), ['cidade', 'origem', 'categoria', 'tipo']) ?? groupable.find((f) => f !== catA);
  const catC = prefer(groupable.filter((f) => f !== catA && f !== catB), ['empresa', 'cliente', 'conta']);

  const views: ViewConfig[] = [];
  const layout: LayoutItem[] = [];
  const add = (view: ViewConfig, pos: Omit<LayoutItem, 'i'>) => {
    views.push(view);
    layout.push({ i: view.id, ...pos });
  };
  const count: Metric = { kind: 'count' };
  const sum: Metric = num ? { kind: 'sum', fieldId: num.id } : count;

  add({ id: 'v-total', title: 'Total de cards', chart: 'kpi', dimension: { kind: 'none' }, metric: count, filters: [] }, { x: 0, y: 0, w: 4, h: 2 });
  if (num) {
    add({ id: 'v-sum', title: `${num.label} (soma)`, chart: 'kpi', dimension: { kind: 'none' }, metric: sum, filters: [] }, { x: 4, y: 0, w: 4, h: 2 });
    add({ id: 'v-avg', title: `${num.label} (média por card)`, chart: 'kpi', dimension: { kind: 'none' }, metric: { kind: 'avg', fieldId: num.id }, filters: [] }, { x: 8, y: 0, w: 4, h: 2 });
  } else {
    add({ id: 'v-open', title: 'Cards em aberto', chart: 'kpi', dimension: { kind: 'none' }, metric: count, filters: [{ kind: 'status', values: ['open'] }] }, { x: 4, y: 0, w: 4, h: 2 });
    add({ id: 'v-done', title: 'Cards concluídos', chart: 'kpi', dimension: { kind: 'none' }, metric: count, filters: [{ kind: 'status', values: ['done'] }] }, { x: 8, y: 0, w: 4, h: 2 });
  }

  const byA: Dimension = catA ? { kind: 'field', fieldId: catA.id } : { kind: 'phase' };
  add(
    { id: 'v-by-a', title: num ? `${num.label} por ${catA?.label ?? 'fase'}` : `Cards por ${catA?.label ?? 'fase'}`, chart: 'bar', dimension: byA, metric: sum, filters: [], limit: 15 },
    { x: 0, y: 2, w: 6, h: 5 },
  );
  const time: Dimension = date ? { kind: 'field', fieldId: date.id, grain: 'month' } : { kind: 'createdAt', grain: 'month' };
  add(
    { id: 'v-time', title: date ? `Cards por mês de ${date.label}` : 'Cards criados por mês', chart: 'line', dimension: time, metric: count, filters: [] },
    { x: 6, y: 2, w: 6, h: 5 },
  );
  if (catC) {
    add(
      { id: 'v-top-c', title: `Top 10 ${catC.label} por ${num?.label ?? 'cards'}`, chart: 'table', dimension: { kind: 'field', fieldId: catC.id }, metric: sum, filters: [], limit: 11 },
      { x: 0, y: 7, w: 5, h: 6 },
    );
  }
  if (catB) {
    add(
      { id: 'v-by-b', title: `Cards por ${catB.label}`, chart: 'bar', dimension: { kind: 'field', fieldId: catB.id }, metric: count, filters: [], limit: 12 },
      { x: catC ? 5 : 0, y: 7, w: catC ? 7 : 8, h: 6 },
    );
  }
  add({ id: 'v-phase', title: 'Cards por fase', chart: 'pie', dimension: { kind: 'phase' }, metric: count, filters: [] }, { x: 0, y: 13, w: 5, h: 5 });

  return { version: 1, views, layout };
}

function parse(raw: unknown): DashboardConfig | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (value && value.version === 1 && Array.isArray(value.views) && Array.isArray(value.layout)) return value;
  } catch {
    /* configuração inválida: ignora */
  }
  return null;
}

/**
 * Configuração do painel por usuário.
 * Principal: dado privado do app no Pipefy (p.set, visibilidade private), que acompanha a pessoa em qualquer navegador.
 * Cópia local: IndexedDB do usuário, para abrir na hora e funcionar se o Pipefy não responder.
 */
export async function loadDashboard(client: PipefyClient, db: DashboardDb, fields: FieldMeta[], timeoutMs = 2000): Promise<DashboardConfig> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  const remote = parse(await Promise.race([client.getPrivate(KEY).catch(() => null), timeout]));
  if (remote) {
    await db.setMeta(KEY, remote);
    return remote;
  }
  return parse(await db.getMeta(KEY)) ?? defaultDashboard(fields);
}

export async function saveDashboard(client: PipefyClient, db: DashboardDb, config: DashboardConfig): Promise<void> {
  await db.setMeta(KEY, config);
  try {
    await client.setPrivate(KEY, JSON.stringify(config));
  } catch {
    /* fica a cópia local */
  }
}
