import { parseFilters } from '../analytics/filters';
import type { ViewConfig } from '../analytics/types';
import type { DashboardDb } from '../data/db';
import type { FieldMeta } from '../pipefy/queries';
import type { PipefyClient } from '../pipefy/sdk';
import { defaultDashboard } from './defaultDashboard';
import type { DashboardConfig, LayoutItem } from './types';

const KEY = 'dashboard:v2';
const REMOTE_TIMEOUT_MS = 2000;

const CHARTS = new Set(['bar', 'hbar', 'funnel', 'line', 'pie', 'kpi', 'table']);
const DIMENSIONS = new Set(['none', 'phase', 'status', 'label', 'assignee', 'field', 'createdAt', 'finishedAt']);
const METRICS = new Set(['count', 'sum', 'avg', 'avgLeadTimeDays']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isView(v: unknown): v is ViewConfig {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    CHARTS.has(v.chart as string) &&
    isObject(v.dimension) &&
    DIMENSIONS.has(v.dimension.kind as string) &&
    isObject(v.metric) &&
    METRICS.has(v.metric.kind as string) &&
    Array.isArray(v.filters)
  );
}

function isLayout(v: unknown): v is LayoutItem {
  return isObject(v) && typeof v.i === 'string' && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(v[k]));
}

export function parseDashboard(raw: unknown): DashboardConfig | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.views) || !Array.isArray(value.layout))
    return null;

  const views = value.views.filter(isView).map((v) => ({ ...v, filters: parseFilters(v.filters) }));
  const ids = new Set(views.map((v) => v.id));
  const layout = value.layout.filter(isLayout).filter((l) => ids.has(l.i));
  const placed = new Set(layout.map((l) => l.i));
  for (const v of views) if (!placed.has(v.id)) layout.push({ i: v.id, x: 0, y: Infinity, w: 6, h: 5 });
  return { version: 1, views, layout, filters: parseFilters(value.filters) };
}

/** Fonte principal é o dado privado do app no Pipefy; a cópia no IndexedDB abre na hora e cobre falhas. */
export async function loadDashboard(
  client: PipefyClient,
  db: DashboardDb,
  fields: FieldMeta[],
  timeoutMs = REMOTE_TIMEOUT_MS,
): Promise<DashboardConfig> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const remote = parseDashboard(await Promise.race([client.getPrivate(KEY).catch(() => null), timeout]));
  if (remote) {
    await db.setMeta(KEY, remote);
    return remote;
  }
  return parseDashboard(await db.getMeta(KEY)) ?? defaultDashboard(fields);
}

export async function saveDashboard(client: PipefyClient, db: DashboardDb, config: DashboardConfig): Promise<void> {
  await db.setMeta(KEY, config);
  try {
    await client.setPrivate(KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[dashboard] não foi possível salvar no Pipefy; mantida a cópia local', err);
  }
}
