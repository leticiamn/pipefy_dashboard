import { useMemo, useState } from 'react';
import GridLayout, { type Layout, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { ViewConfig } from '../analytics/types';
import type { PipefyClient } from '../pipefy/sdk';
import { ChartWidget } from './ChartWidget';
import { ConfirmDialog } from './ConfirmDialog';
import { DashboardFilters } from './filters/DashboardFilters';
import { buildFilterFields, usableRules } from './filters/filterFields';
import { useDashboardConfig } from './hooks/useDashboardConfig';
import { useDashboardSession } from './hooks/useDashboardSession';
import { SyncStatus } from './SyncStatus';
import { Toolbar } from './Toolbar';
import { ViewEditor } from './ViewEditor';

const Grid = WidthProvider(GridLayout);

const newView = (): ViewConfig => ({
  id: `v-${crypto.randomUUID()}`,
  title: 'Nova visão',
  chart: 'bar',
  dimension: { kind: 'phase' },
  metric: { kind: 'count' },
  filters: [],
  limit: 12,
});

export function App({ client }: { client: PipefyClient }) {
  const { agg, session, fatal, syncError, progress, dataVersion, lastSync, reloadAll } = useDashboardSession(client);
  const { config, saveView, removeView, updateLayout, setFilters, resetToDefault } = useDashboardConfig(
    client,
    session,
  );
  const [editing, setEditing] = useState<ViewConfig | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const filterFields = useMemo(() => buildFilterFields(session?.fields ?? []), [session]);
  const knownFields = useMemo(() => new Set(filterFields.map((f) => f.id)), [filterFields]);
  const globalFilters = useMemo(() => usableRules(config?.filters ?? [], knownFields), [config?.filters, knownFields]);
  const phaseOrder = useMemo(() => session?.phases.map((p) => p.id) ?? [], [session]);

  if (fatal) {
    return (
      <div className="center">
        <h1>Não foi possível abrir o dashboard</h1>
        <p>{fatal}</p>
      </div>
    );
  }
  if (!session || !config) return <div className="center">Carregando o pipe…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{session.pipeName}</h1>
          <p className="muted">
            {client.mode === 'demo' && <span className="badge">modo demo</span>} Painel de {session.userName}
            {lastSync &&
              ` · atualizado em ${new Date(lastSync).toLocaleString('pt-BR', { timeZone: session.timeZone })}`}
          </p>
        </div>
        <Toolbar
          busy={progress.phase === 'full'}
          onNewView={() => setEditing(newView())}
          onReloadAll={reloadAll}
          onResetDefault={() => setConfirmReset(true)}
        />
      </header>

      <SyncStatus progress={progress} error={syncError} />

      <DashboardFilters rules={config.filters} fields={filterFields} phases={session.phases} onChange={setFilters} />

      <Grid
        className="grid"
        layout={config.layout as Layout[]}
        cols={12}
        rowHeight={56}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        draggableHandle=".drag-handle"
        onLayoutChange={updateLayout}
      >
        {config.views.map((view) => (
          <div key={view.id}>
            <ChartWidget
              view={view}
              agg={agg}
              dataVersion={dataVersion}
              globalFilters={globalFilters}
              knownFields={knownFields}
              phaseOrder={phaseOrder}
              fields={session.fields}
              onEdit={() => setEditing(view)}
              onRemove={() => removeView(view.id)}
            />
          </div>
        ))}
      </Grid>

      {editing && (
        <ViewEditor
          initial={editing}
          phases={session.phases}
          fields={session.fields}
          onSave={(view) => {
            saveView(view);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Restaurar o painel padrão?"
          message="Suas visões, posições e filtros do painel serão substituídos pelo painel padrão. Isso não pode ser desfeito."
          confirmLabel="Restaurar"
          onConfirm={() => {
            resetToDefault();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
