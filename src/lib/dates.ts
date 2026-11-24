const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Nomes de fuso no formato do Rails (usado em perfis) que não são IANA. */
const RAILS_ZONES: Record<string, string> = {
  Brasilia: 'America/Sao_Paulo',
  'Buenos Aires': 'America/Argentina/Buenos_Aires',
  Santiago: 'America/Santiago',
  Bogota: 'America/Bogota',
  Lima: 'America/Lima',
  'Mexico City': 'America/Mexico_City',
  'Eastern Time (US & Canada)': 'America/New_York',
  'Central Time (US & Canada)': 'America/Chicago',
  'Mountain Time (US & Canada)': 'America/Denver',
  'Pacific Time (US & Canada)': 'America/Los_Angeles',
  Lisbon: 'Europe/Lisbon',
  London: 'Europe/London',
  Madrid: 'Europe/Madrid',
  Paris: 'Europe/Paris',
  Berlin: 'Europe/Berlin',
  UTC: 'UTC',
};

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const isValidZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Aceita IANA ("America/Sao_Paulo") ou o nome do Rails ("Brasilia"); sem fuso válido, usa o do navegador. */
export function resolveTimeZone(zone: string | null | undefined): string {
  const candidate = zone ? (RAILS_ZONES[zone] ?? zone) : '';
  return candidate && isValidZone(candidate) ? candidate : browserTimeZone();
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Dia (AAAA-MM-DD) no fuso dado. Datas sem hora já são o próprio dia. */
export function localDay(value: string, timeZone: string): string | null {
  if (DATE_ONLY.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : dayFormatter(timeZone).format(t);
}

/** Semana ISO 8601 de um dia AAAA-MM-DD, ex.: 2026-W47. */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
