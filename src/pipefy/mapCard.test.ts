import { describe, expect, it } from 'vitest';
import { mapCard, toIsoDate } from './mapCard';

describe('toIsoDate', () => {
  it('converte datas do Pipefy', () => {
    expect(toIsoDate('26/05/2027')).toBe('2027-05-26');
    expect(toIsoDate('1/2/2027 9:05')).toBe('2027-02-01T09:05:00');
    expect(toIsoDate('2027-05-26')).toBe('2027-05-26');
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('amanhã')).toBeNull();
  });
});

describe('mapCard', () => {
  it('converte número, data e texto conforme o tipo do campo', () => {
    const c = mapCard({
      id: '1000000001',
      title: 'Cliente Exemplo',
      createdAt: '2026-11-13T10:00:00Z',
      done: true,
      current_phase: { id: 'p9', name: 'Concluded' },
      fields: [
        { field: { id: 'valor_total', type: 'number' }, value: '1234567.89' },
        { field: { id: 'data_limite', type: 'date' }, value: '26/05/2027' },
        { field: { id: 'estado', type: 'short_text' }, value: 'RS' },
      ],
    });
    expect(c.fields).toEqual({ valor_total: 1234567.89, data_limite: '2027-05-26', estado: 'RS' });
    expect(c.phaseName).toBe('Concluded');
    expect(c.done).toBe(true);
  });
});
