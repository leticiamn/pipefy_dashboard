import { describe, expect, it } from 'vitest';
import { isCardId, toIsoDate, toNumber } from './parse';

describe('toNumber', () => {
  it('entende formatos brasileiro e internacional', () => {
    expect(toNumber('1.234,56')).toBe(1234.56);
    expect(toNumber('1234.56')).toBe(1234.56);
    expect(toNumber('R$ 10,00')).toBe(10);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('converte datas do Pipefy', () => {
    expect(toIsoDate('26/05/2027')).toBe('2027-05-26');
    expect(toIsoDate('1/2/2027 9:05')).toBe('2027-02-01T09:05:00');
    expect(toIsoDate('2027-05-26')).toBe('2027-05-26');
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('amanhã')).toBeNull();
  });
});

describe('isCardId', () => {
  it('aceita só ids numéricos', () => {
    expect(isCardId('1000000001')).toBe(true);
    expect(isCardId('1") { id } x: card(id: "2')).toBe(false);
    expect(isCardId(12)).toBe(false);
  });
});
