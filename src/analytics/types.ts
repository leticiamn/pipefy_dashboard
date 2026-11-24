/** Card normalizado, no formato guardado no cache e usado pela agregação. */
export interface CardRecord {
  id: string;
  title: string;
  phaseId: string;
  phaseName: string;
  createdAt: string; // ISO
  updatedAt: string | null;
  finishedAt: string | null;
  dueDate: string | null;
  done: boolean;
  labels: string[];
  assignees: string[];
  /** Valores dos campos do card, por id do campo. Número quando o campo é numérico. */
  fields: Record<string, string | number | null>;
}

export type TimeGrain = 'day' | 'week' | 'month';

export type Dimension =
  | { kind: 'none' }
  | { kind: 'phase' }
  | { kind: 'status' }
  | { kind: 'label' }
  | { kind: 'assignee' }
  /** Campo do pipe. Com `grain`, um campo de data é agrupado por dia, semana ou mês. */
  | { kind: 'field'; fieldId: string; grain?: TimeGrain }
  | { kind: 'createdAt'; grain: TimeGrain }
  | { kind: 'finishedAt'; grain: TimeGrain };

export type Metric =
  | { kind: 'count' }
  | { kind: 'sum'; fieldId: string }
  | { kind: 'avg'; fieldId: string }
  | { kind: 'avgLeadTimeDays' };

export type Filter =
  | { kind: 'phase'; values: string[] }
  | { kind: 'label'; values: string[] }
  | { kind: 'assignee'; values: string[] }
  | { kind: 'status'; values: Array<'open' | 'done'> }
  | { kind: 'field'; fieldId: string; values: string[] }
  | { kind: 'createdBetween'; from?: string; to?: string };

export type ChartType = 'bar' | 'line' | 'pie' | 'kpi' | 'table';

export interface ViewConfig {
  id: string;
  title: string;
  chart: ChartType;
  dimension: Dimension;
  metric: Metric;
  filters: Filter[];
  /** Máximo de categorias; o excedente vira "Outros". Ignorado em dimensões de tempo. */
  limit?: number;
}

export interface AggregateRow {
  key: string;
  label: string;
  value: number;
}

export interface AggregateResult {
  rows: AggregateRow[];
  /** Valor da métrica sobre todos os cards filtrados (base do KPI). */
  total: number;
  /** Quantidade de cards que passaram pelos filtros. */
  cardCount: number;
}

export const EMPTY_LABEL = '(vazio)';
export const OTHERS_KEY = '__others__';
