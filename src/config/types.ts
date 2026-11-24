import type { FilterRule, ViewConfig } from '../analytics/types';

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardConfig {
  version: 1;
  views: ViewConfig[];
  layout: LayoutItem[];
  filters: FilterRule[];
}
