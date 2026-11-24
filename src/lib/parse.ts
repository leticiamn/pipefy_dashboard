/** Aceita "1.234,56", "1234.56" e "R$ 10,00". */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/[^\d,.-]/g, '');
  if (!raw) return null;
  const decimalComma = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.');
  const normalized = decimalComma ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Aceita "26/05/2027", "26/05/2027 14:30" e ISO. Sem hora, devolve só a data ("2027-05-26"). */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return hh ? `${date}T${hh.padStart(2, '0')}:${mm}:00` : date;
  }
  return Number.isNaN(Date.parse(v)) ? null : v;
}

export const isCardId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,20}$/.test(value);
