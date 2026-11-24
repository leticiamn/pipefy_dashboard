import type { FilterRule, RuleOp } from '../../analytics/types';
import { NO_VALUE_OPS } from '../../analytics/filters';
import { type FilterField, newRule, OPS, REMOVED_FIELD, STATUS_OPTIONS } from './filterFields';

interface Props {
  rules: FilterRule[];
  fields: FilterField[];
  phases: Array<{ id: string; name: string }>;
  onChange: (rules: FilterRule[]) => void;
}

export function FilterRules({ rules, fields, phases, onChange }: Props) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const update = (index: number, patch: Partial<FilterRule>) =>
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rules.filter((_, i) => i !== index));

  return (
    <div className="filter-rules">
      {rules.map((rule, index) => {
        const field = byId.get(rule.field);
        if (!field) {
          return (
            <div className="filter-rule" key={index}>
              <select aria-label="Campo" disabled>
                <option>{REMOVED_FIELD}</option>
              </select>
              <span />
              <span />
              <RemoveButton onClick={() => remove(index)} />
            </div>
          );
        }
        return (
          <div className="filter-rule" key={index}>
            <select
              aria-label="Campo"
              value={field.id}
              onChange={(e) => {
                const next = byId.get(e.target.value);
                if (next) onChange(rules.map((r, i) => (i === index ? newRule(next) : r)));
              }}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Condição"
              value={rule.op}
              onChange={(e) => update(index, { op: e.target.value as RuleOp })}
            >
              {OPS[field.kind].map(([op, label]) => (
                <option key={op} value={op}>
                  {label}
                </option>
              ))}
            </select>
            <RuleValue rule={rule} field={field} phases={phases} onChange={(patch) => update(index, patch)} />
            <RemoveButton onClick={() => remove(index)} />
          </div>
        );
      })}
      <button type="button" className="link" onClick={() => onChange([...rules, newRule(fields[0])])}>
        + Filtro
      </button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon" aria-label="Remover filtro" onClick={onClick}>
      ×
    </button>
  );
}

interface ValueProps {
  rule: FilterRule;
  field: FilterField;
  phases: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<FilterRule>) => void;
}

function RuleValue({ rule, field, phases, onChange }: ValueProps) {
  if (NO_VALUE_OPS.has(rule.op)) return <span />;

  if (field.kind === 'phase') {
    const selected = (rule.value ?? '').split(',').filter(Boolean);
    return (
      <select
        aria-label="Fases"
        multiple={rule.op === 'in'}
        value={rule.op === 'in' ? selected : (selected[0] ?? '')}
        onChange={(e) => onChange({ value: [...e.target.selectedOptions].map((o) => o.value).join(',') })}
      >
        {rule.op !== 'in' && <option value="">Escolha a fase</option>}
        {phases.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'status') {
    return (
      <select aria-label="Situação" value={rule.value ?? ''} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">Escolha</option>
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  const type = field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text';
  const input = (key: 'value' | 'value2', label: string) => (
    <input
      aria-label={label}
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={rule[key] ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value })}
    />
  );

  if (rule.op === 'between') {
    return (
      <span className="filter-range">
        {input('value', 'De')}
        {input('value2', 'Até')}
      </span>
    );
  }
  return input('value', 'Valor');
}
