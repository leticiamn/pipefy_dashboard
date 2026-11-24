import type { AggregateRow, ChartType } from '../analytics/types';
import { formatNumber } from './labels';

const PALETTE = ['#3B5BDB', '#F08C00', '#2F9E44', '#AE3EC9', '#E8590C', '#1098AD', '#C2255C', '#5C940D', '#868E96'];

const valueAxis = { type: 'value', axisLabel: { formatter: (v: number) => formatNumber(v) } };
const grid = { left: 8, right: 16, top: 16, bottom: 8, containLabel: true };

function pieOption(rows: AggregateRow[]) {
  return {
    legend: { type: 'scroll', bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        top: 0,
        bottom: 28,
        data: rows.map((r) => ({ name: r.label, value: r.value })),
        label: { formatter: '{d}%' },
      },
    ],
  };
}

/** Funil em barras: cada barra é centralizada somando um espaçador invisível à esquerda. */
function funnelOption(labels: string[], values: number[]) {
  const max = Math.max(...values, 1);
  const top = values[0] || 1;
  return {
    grid: { ...grid, right: 8 },
    xAxis: { type: 'value', max, show: false },
    yAxis: {
      type: 'category',
      data: labels,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { width: 140, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        stack: 'funnel',
        silent: true,
        tooltip: { show: false },
        itemStyle: { color: 'transparent' },
        data: values.map((v) => (max - v) / 2),
      },
      {
        type: 'bar',
        stack: 'funnel',
        barCategoryGap: '25%',
        itemStyle: { borderRadius: 4 },
        data: values,
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          fontWeight: 600,
          formatter: ({ value }: { value: number }) => `${formatNumber(value)} · ${Math.round((value / top) * 100)}%`,
        },
      },
    ],
  };
}

function horizontalBarOption(labels: string[], values: number[]) {
  return {
    grid: { ...grid, right: 24 },
    xAxis: valueAxis,
    yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { width: 140, overflow: 'truncate' } },
    series: [{ type: 'bar', data: values, barMaxWidth: 28 }],
  };
}

function columnOption(labels: string[], values: number[]) {
  return {
    grid,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, rotate: labels.length > 6 ? 30 : 0, width: 110, overflow: 'truncate' },
    },
    yAxis: valueAxis,
    series: [{ type: 'bar', data: values, barMaxWidth: 48 }],
  };
}

function lineOption(labels: string[], values: number[]) {
  return {
    grid,
    xAxis: { type: 'category', data: labels, axisLabel: { hideOverlap: true } },
    yAxis: valueAxis,
    series: [
      { type: 'line', data: values, smooth: true, showSymbol: values.length < 40, areaStyle: { opacity: 0.08 } },
    ],
  };
}

/** Opção do ECharts para os tipos gráficos (kpi e tabela são renderizados sem ECharts). */
export function chartOption(chart: ChartType, rows: AggregateRow[]) {
  const labels = rows.map((r) => r.label);
  const values = rows.map((r) => r.value);
  const tooltip = {
    trigger: chart === 'line' || chart === 'bar' || chart === 'hbar' ? 'axis' : 'item',
    valueFormatter: (v: number) => formatNumber(v),
  };
  const body =
    chart === 'pie'
      ? pieOption(rows)
      : chart === 'funnel'
        ? funnelOption(labels, values)
        : chart === 'hbar'
          ? horizontalBarOption(labels, values)
          : chart === 'line'
            ? lineOption(labels, values)
            : columnOption(labels, values);
  return { color: PALETTE, tooltip, ...body };
}
