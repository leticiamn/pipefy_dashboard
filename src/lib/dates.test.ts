import { describe, expect, it } from 'vitest';
import { isoWeek, localDay, resolveTimeZone } from './dates';

describe('datas no fuso do perfil', () => {
  it('converte data com hora para o dia no fuso dado', () => {
    expect(localDay('2026-11-14T01:30:00Z', 'America/Sao_Paulo')).toBe('2026-11-13');
    expect(localDay('2026-11-14T01:30:00Z', 'Europe/Lisbon')).toBe('2026-11-14');
  });

  it('mantém o dia de datas sem hora e rejeita inválidas', () => {
    expect(localDay('2027-05-26', 'Asia/Tokyo')).toBe('2027-05-26');
    expect(localDay('não é data', 'UTC')).toBeNull();
  });

  it('aceita IANA e nomes do Rails, e cai no fuso do navegador', () => {
    expect(resolveTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(resolveTimeZone('Brasilia')).toBe('America/Sao_Paulo');
    expect(resolveTimeZone('Fuso/Inexistente')).toBe(resolveTimeZone(null));
  });

  it('calcula a semana ISO', () => {
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });
});
