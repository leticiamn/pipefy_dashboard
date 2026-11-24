import { useEffect, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { AggregateResult, ViewConfig } from '../analytics/types';
import type { AggregationClient } from '../analytics/workerClient';
import type { FieldMeta } from '../pipefy/queries';
import { formatNumber, metricLabel } from './labels';

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const PALETTE = ['#3B5BDB', '#F08C00', '#2F9E44', '#AE3EC9', '#E8590C', '#1098AD', '#C2255C', '#5C940D', '#868E96'];

interface Props {
  view: ViewConfig;
  agg: AggregationClient;
  dataVersion: number;
  fields: FieldMeta[];
  onEdit: () => void;
  onRemove: () => void;
}

export function ChartWidget({ view, agg, dataVersion, fields, onEdit, onRemove }: Props) {
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    agg
      .aggregate(view)
      .then((r) => alive && (setResult(r), setError(null)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [agg, view, dataVersion]);

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

  const labels = result.rows.map((r) => r.label);
  const values = result.rows.map((r) => r.value);
  const tooltip = { trigger: view.chart === 'pie' ? 'item' : 'axis', valueFormatter: (v: number) => formatNumber(v) };
  const option =
    view.chart === 'pie'
      ? {
          color: PALETTE,
          tooltip,
          legend: { type: 'scroll', bottom: 0 },
          series: [
            {
              type: 'pie',
              radius: ['40%', '70%'],
              top: 0,
              bottom: 28,
              data: result.rows.map((r) => ({ name: r.label, value: r.value })),
              label: { formatter: '{d}%' },
            },
          ],
        }
      : {
          color: PALETTE,
          tooltip,
          grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel:
              view.chart === 'bar'
                ? { interval: 0, rotate: labels.length > 6 ? 30 : 0, width: 110, overflow: 'truncate' }
                : { hideOverlap: true },
          },
          yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatNumber(v) } },
          series: [
            view.chart === 'line'
              ? { type: 'line', data: values, smooth: true, showSymbol: values.length < 40, areaStyle: { opacity: 0.08 } }
              : { type: 'bar', data: values, barMaxWidth: 48 },
          ],
        };

  return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: '100%', width: '100%' }} />;
}
