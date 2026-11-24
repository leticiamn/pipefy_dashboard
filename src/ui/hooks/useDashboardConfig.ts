import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterRule, ViewConfig } from '../../analytics/types';
import { loadDashboard, saveDashboard } from '../../config/dashboardStore';
import { defaultDashboard } from '../../config/defaultDashboard';
import type { DashboardConfig, LayoutItem } from '../../config/types';
import type { PipefyClient } from '../../pipefy/sdk';
import type { Session } from './useDashboardSession';

const SAVE_DEBOUNCE_MS = 600;

const sameLayout = (a: LayoutItem[], b: LayoutItem[]) =>
  a.length === b.length &&
  a.every((l, i) => l.i === b[i].i && l.x === b[i].x && l.y === b[i].y && l.w === b[i].w && l.h === b[i].h);

function defaultSize(view: ViewConfig): Pick<LayoutItem, 'w' | 'h'> {
  return view.chart === 'kpi' ? { w: 4, h: 2 } : { w: 6, h: 5 };
}

export function useDashboardConfig(client: PipefyClient, session: Session | null) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const saveTimer = useRef<number>();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    loadDashboard(client, session.db, session.fields).then((loaded) => !cancelled && setConfig(loaded));
    return () => {
      cancelled = true;
    };
  }, [client, session]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const persist = useCallback(
    (next: DashboardConfig) => {
      setConfig(next);
      if (!session) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveDashboard(client, session.db, next), SAVE_DEBOUNCE_MS);
    },
    [client, session],
  );

  const saveView = useCallback(
    (view: ViewConfig) => {
      if (!config) return;
      const exists = config.views.some((v) => v.id === view.id);
      persist({
        ...config,
        views: exists ? config.views.map((v) => (v.id === view.id ? view : v)) : [...config.views, view],
        layout: exists ? config.layout : [...config.layout, { i: view.id, x: 0, y: Infinity, ...defaultSize(view) }],
      });
    },
    [config, persist],
  );

  const removeView = useCallback(
    (id: string) => {
      if (!config) return;
      persist({
        ...config,
        views: config.views.filter((v) => v.id !== id),
        layout: config.layout.filter((l) => l.i !== id),
      });
    },
    [config, persist],
  );

  /** O grid avisa mudança de layout também ao montar: só salva se a posição mudou de fato. */
  const updateLayout = useCallback(
    (layout: LayoutItem[]) => {
      if (!config) return;
      const next = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
      if (!sameLayout(next, config.layout)) persist({ ...config, layout: next });
    },
    [config, persist],
  );

  const setFilters = useCallback(
    (filters: FilterRule[]) => {
      if (config) persist({ ...config, filters });
    },
    [config, persist],
  );

  const resetToDefault = useCallback(() => {
    if (session) persist(defaultDashboard(session.fields));
  }, [session, persist]);

  return { config, saveView, removeView, updateLayout, setFilters, resetToDefault };
}
