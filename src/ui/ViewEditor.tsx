import { useMemo, useState } from 'react';
import { isComplete } from '../analytics/filters';
import type { ChartType, Dimension, FilterRule, Metric, ViewConfig } from '../analytics/types';
import { isDateField, isGroupableField, isNumericField } from '../pipefy/mapCard';
import type { FieldMeta } from '../pipefy/queries';
import { buildFilterFields } from './filters/filterFields';
import { FilterRules } from './filters/FilterRules';
import { useEscape } from './hooks/useEscape';
import { CHART_LABELS } from './labels';

interface Props {
  initial: ViewConfig;
  phases: Array<{ id: string; name: string }>;
  fields: FieldMeta[];
  onSave: (view: ViewConfig) => void;
  onCancel: () => void;
}

function encodeDim(d: Dimension): string {
  switch (d.kind) {
    case 'field':
      return d.grain ? `field:${d.fieldId}@${d.grain}` : `field:${d.fieldId}`;
    case 'createdAt':
    case 'finishedAt':
      return `${d.kind}:${d.grain}`;
    default:
      return d.kind;
  }
}

function decodeDim(v: string): Dimension {
  const [kind, arg] = v.split(/:(.*)/s);
  if (kind === 'field') {
    const at = arg.lastIndexOf('@');
    return at > 0
      ? { kind: 'field', fieldId: arg.slice(0, at), grain: arg.slice(at + 1) as 'day' | 'week' | 'month' }
      : { kind: 'field', fieldId: arg };
  }
  if (kind === 'createdAt' || kind === 'finishedAt') return { kind, grain: arg as 'day' | 'week' | 'month' };
  return { kind } as Dimension;
}

function encodeMetric(m: Metric): string {
  return m.kind === 'sum' || m.kind === 'avg' ? `${m.kind}:${m.fieldId}` : m.kind;
}

function decodeMetric(v: string): Metric {
  const [kind, arg] = v.split(/:(.*)/s);
  if (kind === 'sum' || kind === 'avg') return { kind, fieldId: arg };
  return { kind } as Metric;
}

export function ViewEditor({ initial, phases, fields, onSave, onCancel }: Props) {
  useEscape(onCancel);
  const [title, setTitle] = useState(initial.title);
  const [chart, setChart] = useState<ChartType>(initial.chart);
  const [dim, setDim] = useState(encodeDim(initial.dimension));
  const [metric, setMetric] = useState(encodeMetric(initial.metric));
  const [rules, setRules] = useState<FilterRule[]>(initial.filters);
  const [limit, setLimit] = useState(initial.limit ?? 12);

  const numeric = fields.filter(isNumericField);
  const groupable = fields.filter(isGroupableField);
  const dates = fields.filter(isDateField);
  const filterFields = useMemo(() => buildFilterFields(fields), [fields]);
  const isKpi = chart === 'kpi';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...initial,
      title: title.trim() || 'Sem título',
      chart,
      dimension: isKpi ? { kind: 'none' } : decodeDim(dim),
      metric: decodeMetric(metric),
      filters: rules.filter(isComplete),
      limit: isKpi ? undefined : Math.max(0, Number(limit) || 0),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal"
        role="dialog"
        aria-label="Configurar visão"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Configurar visão</h2>

        <label>
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <div className="row">
          <label>
            Tipo de gráfico
            <select value={chart} onChange={(e) => setChart(e.target.value as ChartType)}>
              {Object.entries(CHART_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label>
            Agrupar por
            <select value={isKpi ? 'none' : dim} onChange={(e) => setDim(e.target.value)} disabled={isKpi}>
              <option value="none">Sem agrupamento</option>
              <option value="phase">Fase</option>
              <option value="status">Situação (aberto ou concluído)</option>
              <option value="label">Etiqueta</option>
              <option value="assignee">Responsável</option>
              <option value="createdAt:month">Criação por mês</option>
              <option value="createdAt:week">Criação por semana</option>
              <option value="createdAt:day">Criação por dia</option>
              <option value="finishedAt:month">Conclusão por mês</option>
              {dates.length > 0 && (
                <optgroup label="Campos de data">
                  {dates.flatMap((f) =>
                    (['month', 'week', 'day'] as const).map((g) => (
                      <option key={`${f.id}@${g}`} value={`field:${f.id}@${g}`}>
                        {f.label} por {g === 'month' ? 'mês' : g === 'week' ? 'semana' : 'dia'}
                      </option>
                    )),
                  )}
                </optgroup>
              )}
              {groupable.length > 0 && (
                <optgroup label="Campos do pipe">
                  {groupable.map((f) => (
                    <option key={f.id} value={`field:${f.id}`}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        </div>

        <div className="row">
          <label>
            Métrica
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="count">Quantidade de cards</option>
              <option value="avgLeadTimeDays">Dias até concluir (média)</option>
              {numeric.map((f) => (
                <option key={`sum-${f.id}`} value={`sum:${f.id}`}>
                  Soma de {f.label}
                </option>
              ))}
              {numeric.map((f) => (
                <option key={`avg-${f.id}`} value={`avg:${f.id}`}>
                  Média de {f.label}
                </option>
              ))}
            </select>
          </label>

          {!isKpi && (
            <label>
              Máximo de categorias
              <input type="number" min={0} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </label>
          )}
        </div>

        <fieldset>
          <legend>Filtros desta visão</legend>
          <FilterRules rules={rules} fields={filterFields} phases={phases} onChange={setRules} />
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
