import { useState } from 'react';
import { isComplete } from '../../analytics/filters';
import type { FilterRule } from '../../analytics/types';
import { describeRule, type FilterField } from './filterFields';
import { FilterRules } from './FilterRules';

interface Props {
  rules: FilterRule[];
  fields: FilterField[];
  phases: Array<{ id: string; name: string }>;
  onChange: (rules: FilterRule[]) => void;
}

export function DashboardFilters({ rules, fields, phases, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const known = new Set(fields.map((f) => f.id));
  const active = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => isComplete(rule) && known.has(rule.field));

  return (
    <section className={`dashboard-filters${open ? ' open' : ''}`}>
      <div className="dashboard-filters-bar">
        <button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <FunnelIcon />
          Filtros
          {active.length > 0 && <span className="count">{active.length}</span>}
        </button>
        {active.map(({ rule, index }) => (
          <span className="chip" key={index}>
            {describeRule(rule, fields, phases)}
            <button
              type="button"
              aria-label="Remover filtro"
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </span>
        ))}
        {active.length > 0 && (
          <button type="button" className="link" onClick={() => onChange([])}>
            Limpar tudo
          </button>
        )}
      </div>
      {open && (
        <div className="dashboard-filters-panel">
          <FilterRules rules={rules} fields={fields} phases={phases} onChange={onChange} />
        </div>
      )}
    </section>
  );
}

function FunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h18l-7 8v5l-4 2v-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
