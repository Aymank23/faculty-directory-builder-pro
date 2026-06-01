// AACSB Discipline canonicalization.
//
// The Excel "Disciplines" column carries short codes (MGT, ECO, FIN, MKT,
// ACC, ACC & FIN, HTM, ITM). Discipline is a separate analytical dimension
// from Department and is used across filters, tables, charts, and AACSB
// reports.

export const CANONICAL_DISCIPLINES = [
  'MGT',
  'ECO',
  'FIN',
  'MKT',
  'ACC',
  'ACC & FIN',
  'HTM',
  'ITM',
] as const;

export type CanonicalDiscipline = typeof CANONICAL_DISCIPLINES[number];

const DISCIPLINE_ALIASES: Record<string, CanonicalDiscipline> = {
  mgt: 'MGT',
  mgmt: 'MGT',
  management: 'MGT',
  eco: 'ECO',
  econ: 'ECO',
  economics: 'ECO',
  fin: 'FIN',
  fina: 'FIN',
  finance: 'FIN',
  mkt: 'MKT',
  mktg: 'MKT',
  marketing: 'MKT',
  acc: 'ACC',
  acct: 'ACC',
  accounting: 'ACC',
  'acc&fin': 'ACC & FIN',
  'accandfin': 'ACC & FIN',
  'accfin': 'ACC & FIN',
  htm: 'HTM',
  hospitality: 'HTM',
  itm: 'ITM',
  itom: 'ITM',
  it: 'ITM',
};

function aliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9&]+/g, '');
}

/**
 * Map any discipline value to its canonical AACSB code.
 * Empty / N/A → "N/A". Unknown values are returned trimmed/uppercased.
 */
export function normalizeDiscipline(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const s = String(value).trim();
  if (!s) return 'N/A';
  const lower = s.toLowerCase();
  if (lower === 'na' || lower === 'n/a' || lower === 'none' || lower === 'null') return 'N/A';
  const key = aliasKey(s);
  if (key && DISCIPLINE_ALIASES[key]) return DISCIPLINE_ALIASES[key];
  return s.toUpperCase();
}
