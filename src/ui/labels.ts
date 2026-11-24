import type { ChartType, Dimension, Metric, TimeGrain } from '../analytics/types';
import type { FieldMeta } from '../pipefy/queries';

export const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Colunas',
  hbar: 'Barras',
  funnel: 'Funil',
  line: 'Linha',
  pie: 'Pizza',
  kpi: 'Número (KPI)',
  table: 'Tabela',
};

export const GRAIN_LABELS: Record<TimeGrain, string> = { day: 'dia', week: 'semana', month: 'mês' };

export function dimensionLabel(d: Dimension, fields: FieldMeta[]): string {
  switch (d.kind) {
    case 'none':
      return 'Sem agrupamento';
    case 'phase':
      return 'Fase';
    case 'status':
      return 'Situação';
    case 'label':
      return 'Etiqueta';
    case 'assignee':
      return 'Responsável';
    case 'field': {
      const name = fields.find((f) => f.id === d.fieldId)?.label ?? d.fieldId;
      return d.grain ? `${name} por ${GRAIN_LABELS[d.grain]}` : name;
    }
    case 'createdAt':
      return `Criação por ${GRAIN_LABELS[d.grain]}`;
    case 'finishedAt':
      return `Conclusão por ${GRAIN_LABELS[d.grain]}`;
  }
}

export function metricLabel(m: Metric, fields: FieldMeta[]): string {
  const name = (id: string) => fields.find((f) => f.id === id)?.label ?? id;
  switch (m.kind) {
    case 'count':
      return 'Quantidade de cards';
    case 'sum':
      return `Soma de ${name(m.fieldId)}`;
    case 'avg':
      return `Média de ${name(m.fieldId)}`;
    case 'avgLeadTimeDays':
      return 'Dias até concluir (média)';
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}
