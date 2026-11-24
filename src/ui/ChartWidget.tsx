import { useEffect, useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { presentResult } from '../analytics/present';
import type { AggregateResult, FilterRule, ViewConfig } from '../analytics/types';
import type { AggregationClient } from '../analytics/workerClient';
import type { FieldMeta } from '../pipefy/queries';
import { chartOption } from './chartOptions';
import { usableRules } from './filters/filterFields';
import { formatNumber, metricLabel } from './labels';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LegacyGridContainLabel,
  CanvasRenderer,
]);

interface Props {
  view: ViewConfig;
  agg: AggregationClient;
  dataVersion: number;
  globalFilters: FilterRule[];
  knownFields: ReadonlySet<string>;
  phaseOrder: string[];
  fields: FieldMeta[];
  onEdit: () => void;
  onRemove: () => void;
}

export function ChartWidget(props: Props) {
  const { view, agg, dataVersion, globalFilters, knownFields, phaseOrder, fields, onEdit, onRemove } = props;
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effective = useMemo(
    () => ({ ...view, filters: [...globalFilters, ...usableRules(view.filters, knownFields)] }),
    [view, globalFilters, knownFields],
  );

  useEffect(() => {
    let alive = true;
    agg
      .aggregate(effective)
      .then((r) => alive && (setResult(presentResult(view, r, phaseOrder)), setError(null)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [agg, effective, dataVersion, view, phaseOrder]);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title drag-handle" title="Arraste para mover">
          {view.title}
        </span>
        <span className="widget-actions">
          <button type="button" onClick={onEdit} aria-label={`Editar ${view.title}`}>
            Editar
          </button>
          <button type="button" onClick={onRemove} aria-label={`Remover ${view.title}`}>
            Remover
          </button>
        </span>
      </div>
      <div className="widget-body">
        {error && <p className="widget-error">{error}</p>}
        {!error && !result && <p className="widget-muted">Calculando…</p>}
        {!error && result && <ChartBody view={view} result={result} fields={fields} />}
      </div>
    </div>
  );
}

function ChartBody({ view, result, fields }: { view: ViewConfig; result: AggregateResult; fields: FieldMeta[] }) {
  if (view.chart === 'kpi') {
    return (
      <div className="kpi">
        <div className="kpi-value">{formatNumber(result.total)}</div>
        <div className="kpi-caption">
          {metricLabel(view.metric, fields)} · {formatNumber(result.cardCount)} cards
        </div>
      </div>
    );
  }
  if (!result.rows.length) return <p className="widget-muted">Nenhum card com esses filtros.</p>;

  if (view.chart === 'table') {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="num">{metricLabel(view.metric, fields)}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{formatNumber(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const option = chartOption(view.chart, result.rows);
  return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: '100%', width: '100%' }} />;
}
