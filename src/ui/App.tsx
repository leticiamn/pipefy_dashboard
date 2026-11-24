import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { ViewConfig } from '../analytics/types';
import { AggregationClient } from '../analytics/workerClient';
import { type DashboardConfig, defaultDashboard, loadDashboard, saveDashboard } from '../config/dashboardStore';
import { type DashboardDb, dbName, openDb } from '../data/db';
import { SyncEngine, type SyncProgress } from '../data/sync';
import { CARD_FORMAT, pipeFields } from '../pipefy/mapCard';
import { type FieldMeta, PIPE_COUNTS, PIPE_META, type PipeCountsResponse, type PipeMetaResponse } from '../pipefy/queries';
import type { PipefyClient } from '../pipefy/sdk';
import { ChartWidget } from './ChartWidget';
import { formatNumber } from './labels';
import { ViewEditor } from './ViewEditor';

const Grid = WidthProvider(GridLayout);
const POLL_MS = 60_000;

interface Ready {
  userName: string;
  pipeName: string;
  phases: Array<{ id: string; name: string }>;
  fields: FieldMeta[];
  db: DashboardDb;
  sync: SyncEngine;
  expected?: number;
}

function changesUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_CHANGES_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Em produção, o mesmo Worker que serve o app expõe /api/changes.
  return import.meta.env.PROD ? new URL('/api/changes', window.location.origin).toString() : undefined;
}

const newId = () => `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function App({ client }: { client: PipefyClient }) {
  const agg = useMemo(() => new AggregationClient(), []);
  const [ready, setReady] = useState<Ready | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({ phase: 'idle', loaded: 0, pages: 0 });
  const [dataVersion, setDataVersion] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [editing, setEditing] = useState<ViewConfig | null>(null);
  const saveTimer = useRef<number>();

  const refreshCharts = useCallback(() => {
    agg.invalidate();
    setDataVersion((v) => v + 1);
  }, [agg]);

  // Inicialização: usuário e pipe, cache do usuário, painel salvo e sincronização.
  useEffect(() => {
    let cancelled = false;
    let poll: number | undefined;
    (async () => {
      const meta = await client.query<PipeMetaResponse>(PIPE_META, { pipeId: client.pipeId });
      const userId = String(meta.me.id);
      const db = openDb(userId, client.pipeId);
      // Formato do card mudou desde a última carga: recarrega o cache em vez de misturar formatos.
      if ((await db.getMeta<number>('cardFormat')) !== CARD_FORMAT) {
        await db.cards.clear();
        await db.meta.bulkDelete(['lastSync', 'lastFullSync', 'fullLoad']);
        await db.setMeta('cardFormat', CARD_FORMAT);
      }
      agg.open(dbName(userId, client.pipeId));
      const fields = pipeFields(meta.pipe);

      const sync = new SyncEngine(client, db, {
        changesUrl: changesUrl(),
        onProgress: (p) => !cancelled && setProgress(p),
        onData: async () => {
          if (cancelled) return;
          refreshCharts();
          setLastSync(await sync.lastSync());
        },
      });

      const [dashboard, counts, cached, last] = await Promise.all([
        loadDashboard(client, db, fields),
        client.query<PipeCountsResponse>(PIPE_COUNTS, { pipeId: client.pipeId }).catch(() => null),
        db.cards.count(),
        sync.lastSync(),
      ]);
      if (cancelled) return;

      setConfig(dashboard);
      setLastSync(last);
      setReady({
        userName: meta.me.name,
        pipeName: meta.pipe.name,
        phases: meta.pipe.phases.map(({ id, name }) => ({ id, name })),
        fields,
        db,
        sync,
        expected: counts?.pipe.cards_count,
      });
      if (cached > 0) refreshCharts(); // abre na hora com o cache

      const run = (task: Promise<void>) =>
        task.then(() => setSyncError(null)).catch((e: Error) => !cancelled && setSyncError(e.message));
      run(sync.start(counts?.pipe.cards_count));

      let debounce: number | undefined;
      client.onCardChange(() => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => run(sync.incremental()), 3000);
      });
      poll = window.setInterval(() => {
        if (document.visibilityState === 'visible') run(sync.incremental());
      }, POLL_MS);
    })().catch((e: Error) => !cancelled && setFatal(e.message));

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [agg, client, refreshCharts]);

  useEffect(() => () => agg.terminate(), [agg]);

  const persist = useCallback(
    (next: DashboardConfig) => {
      setConfig(next);
      if (!ready) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveDashboard(client, ready.db, next), 600);
    },
    [client, ready],
  );

  if (fatal) {
    return (
      <div className="center">
        <h1>Não foi possível abrir o dashboard</h1>
        <p>{fatal}</p>
      </div>
    );
  }
  if (!ready || !config) return <div className="center">Carregando o pipe…</div>;

  const loading = progress.phase === 'full';
  const pct = loading && progress.expected ? Math.min(100, Math.round((progress.loaded / progress.expected) * 100)) : null;

  function saveView(view: ViewConfig) {
    if (!config) return;
    const exists = config.views.some((v) => v.id === view.id);
    const views = exists ? config.views.map((v) => (v.id === view.id ? view : v)) : [...config.views, view];
    const layout = exists ? config.layout : [...config.layout, { i: view.id, x: 0, y: Infinity, w: view.chart === 'kpi' ? 4 : 6, h: view.chart === 'kpi' ? 2 : 5 }];
    persist({ ...config, views, layout });
    setEditing(null);
  }

  function removeView(id: string) {
    if (!config) return;
    persist({ ...config, views: config.views.filter((v) => v.id !== id), layout: config.layout.filter((l) => l.i !== id) });
  }

  async function clearCache() {
    if (!ready) return;
    await ready.db.cards.clear();
    await ready.db.meta.bulkDelete(['lastSync', 'lastFullSync', 'fullLoad']);
    refreshCharts();
    ready.sync.reloadAll(ready.expected).catch((e: Error) => setSyncError(e.message));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{ready.pipeName}</h1>
          <p className="muted">
            {client.mode === 'demo' && <span className="badge">modo demo</span>} Painel de {ready.userName}
            {lastSync && ` · atualizado em ${new Date(lastSync).toLocaleString('pt-BR')}`}
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="primary"
            onClick={() =>
              setEditing({ id: newId(), title: 'Nova visão', chart: 'bar', dimension: { kind: 'phase' }, metric: { kind: 'count' }, filters: [], limit: 12 })
            }
          >
            + Nova visão
          </button>
          <button type="button" disabled={loading} onClick={() => ready.sync.reloadAll(ready.expected).catch((e: Error) => setSyncError(e.message))}>
            Atualizar tudo
          </button>
          <button type="button" disabled={loading} onClick={() => void clearCache()}>
            Limpar meu cache
          </button>
          <button type="button" onClick={() => persist(defaultDashboard(ready.fields))}>
            Painel padrão
          </button>
        </div>
      </header>

      {loading && (
        <div className="progress" role="status">
          <div className="progress-text">
            Carregando cards: {formatNumber(progress.loaded)}
            {progress.expected ? ` de ${formatNumber(progress.expected)}` : ''} · os gráficos se completam durante a carga
          </div>
          <div className="progress-bar">
            <div style={{ width: pct !== null ? `${pct}%` : '100%' }} className={pct === null ? 'indeterminate' : ''} />
          </div>
        </div>
      )}
      {syncError && <div className="alert">Falha ao sincronizar: {syncError}. O painel mostra o último dado salvo.</div>}

      <Grid
        className="grid"
        layout={config.layout as Layout[]}
        cols={12}
        rowHeight={56}
        margin={[12, 12]}
        draggableHandle=".drag-handle"
        onLayoutChange={(layout) =>
          persist({ ...config, layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) })
        }
      >
        {config.views.map((view) => (
          <div key={view.id}>
            <ChartWidget
              view={view}
              agg={agg}
              dataVersion={dataVersion}
              fields={ready.fields}
              onEdit={() => setEditing(view)}
              onRemove={() => removeView(view.id)}
            />
          </div>
        ))}
      </Grid>

      {editing && (
        <ViewEditor initial={editing} phases={ready.phases} fields={ready.fields} onSave={saveView} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}
