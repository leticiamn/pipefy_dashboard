export interface CardRecord {
  id: string;
  title: string;
  phaseId: string;
  phaseName: string;
  createdAt: string;
  updatedAt: string | null;
  finishedAt: string | null;
  dueDate: string | null;
  done: boolean;
  labels: string[];
  assignees: string[];
  fields: Record<string, string | number | null>;
}

export type TimeGrain = 'day' | 'week' | 'month';

export type Dimension =
  | { kind: 'none' }
  | { kind: 'phase' }
  | { kind: 'status' }
  | { kind: 'label' }
  | { kind: 'assignee' }
  | { kind: 'field'; fieldId: string; grain?: TimeGrain }
  | { kind: 'createdAt'; grain: TimeGrain }
  | { kind: 'finishedAt'; grain: TimeGrain };

export type Metric =
  { kind: 'count' } | { kind: 'sum'; fieldId: string } | { kind: 'avg'; fieldId: string } | { kind: 'avgLeadTimeDays' };

export type RuleOp =
  'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'is_set' | 'not_set';

/** `field` é o id de um campo do pipe ou um atributo do card (`$title`, `$phase`, `$createdAt`...). */
export interface FilterRule {
  kind: 'rule';
  field: string;
  op: RuleOp;
  value?: string;
  value2?: string;
}

export type ChartType = 'bar' | 'hbar' | 'funnel' | 'line' | 'pie' | 'kpi' | 'table';

export interface ViewConfig {
  id: string;
  title: string;
  chart: ChartType;
  dimension: Dimension;
  metric: Metric;
  filters: FilterRule[];
  /** O excedente vira "Outros". Ignorado em dimensões de tempo. */
  limit?: number;
}

export interface AggregateRow {
  key: string;
  label: string;
  value: number;
}

export interface AggregateResult {
  rows: AggregateRow[];
  total: number;
  cardCount: number;
}

export const EMPTY_LABEL = '(vazio)';
export const OTHERS_KEY = '__others__';
