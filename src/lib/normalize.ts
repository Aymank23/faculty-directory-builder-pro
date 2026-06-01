// Shared normalization helpers used across dashboards & filters.
//
// Goals:
//  1. Collapse the various "not available" tokens into one canonical "N/A".
//  2. Map department aliases (codes / abbreviations / legacy names) to a
//     single canonical department label so filters, charts, and counts
//     don't split the same logical group across multiple buckets.
//
// All filtering, grouping, and dropdown derivation in dashboards should
// route values through these helpers before comparison/display.

/* ─────────────── Generic N/A normalization ─────────────── */

/**
 * Treat the various "not available" tokens as a single canonical value.
 * "NA", "N/A", "n/a", "na", "N.A.", "n.a.", "  na  ", null, undefined, ""
 * all collapse to the canonical token "N/A".
 *
 * Any other value is returned trimmed (preserving original casing).
 */
export function normalizeNA(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const s = String(value).trim();
  if (!s) return 'N/A';
  const stripped = s.replace(/[.\s/\\-]/g, '').toLowerCase();
  if (stripped === 'na') return 'N/A';
  return s;
}

/** True when the value is any flavour of N/A (or empty). */
export function isNA(value: unknown): boolean {
  return normalizeNA(value) === 'N/A';
}

/* ─────────────── Department canonicalization ───────────────
 *
 * Source data for "department" comes from CV parsing, manual entry,
 * Excel imports, and legacy records. The same department may appear
 * under many aliases. We map every alias to a single canonical label
 * so charts, filters, and counts treat them as the same bucket.
 *
 * To add a new alias: add a lowercased, punctuation-stripped key to
 * DEPARTMENT_ALIASES pointing at the canonical label.
 */

/** Canonical department labels (one row per real department). */
export const CANONICAL_DEPARTMENTS = [
  'Marketing',
  'Management',
  'Finance and Accounting',
  'Information Technology and Operations Management',
  'Hospitality and Tourism Management',
  'Economics',
] as const;

export type CanonicalDepartment = typeof CANONICAL_DEPARTMENTS[number];

/**
 * Reduce any string to a comparison key:
 * lowercase, strip punctuation/whitespace, drop common filler words
 * ("and", "&", "of", "the", "studies", "department", "dept"). This lets
 * "Mgmt." == "Management" and "Finance & Accounting" == "Finance and Accounting".
 */
function aliasKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !['and', 'of', 'the', 'dept', 'department', 'studies'].includes(w))
    .join('');
}

/** Map of alias key -> canonical label. */
const DEPARTMENT_ALIASES: Record<string, CanonicalDepartment> = {
  // Marketing
  [aliasKey('Marketing')]: 'Marketing',
  [aliasKey('MKT')]: 'Marketing',
  [aliasKey('Mktg')]: 'Marketing',

  // Management
  [aliasKey('Management')]: 'Management',
  [aliasKey('Management Studies')]: 'Management',
  [aliasKey('MGT')]: 'Management',
  [aliasKey('Mgmt')]: 'Management',

  // Finance and Accounting
  [aliasKey('Finance and Accounting')]: 'Finance and Accounting',
  [aliasKey('Finance & Accounting')]: 'Finance and Accounting',
  [aliasKey('Finance')]: 'Finance and Accounting',
  [aliasKey('FINA')]: 'Finance and Accounting',
  [aliasKey('Accounting')]: 'Finance and Accounting',
  [aliasKey('ACCT')]: 'Finance and Accounting',
  [aliasKey('Banking & Finance')]: 'Finance and Accounting',
  [aliasKey('Banking and Finance')]: 'Finance and Accounting',

  // ITOM
  [aliasKey('Information Technology and Operations Management')]: 'Information Technology and Operations Management',
  [aliasKey('Information Tech & Operations Mgmt')]: 'Information Technology and Operations Management',
  [aliasKey('Inform Tech & Operat Mgmt')]: 'Information Technology and Operations Management',
  [aliasKey('Inform. Tech. & Operat. Mgmt.')]: 'Information Technology and Operations Management',
  [aliasKey('ITOM')]: 'Information Technology and Operations Management',
  [aliasKey('IT & OM')]: 'Information Technology and Operations Management',
  [aliasKey('HITM')]: 'Information Technology and Operations Management',

  // Hospitality and Tourism Management
  [aliasKey('Hospitality and Tourism Management')]: 'Hospitality and Tourism Management',
  [aliasKey('Hospitality & Tourism Mgmt')]: 'Hospitality and Tourism Management',
  [aliasKey('Hospitality & Tourism Mgmt.')]: 'Hospitality and Tourism Management',
  [aliasKey('HTM')]: 'Hospitality and Tourism Management',

  // Economics
  [aliasKey('Economics')]: 'Economics',
  [aliasKey('ECON')]: 'Economics',
};

/**
 * Map any department alias to its canonical label.
 * - Empty / N/A variants → "N/A"
 * - Known alias → canonical label
 * - Unknown → trimmed original (so we don't silently hide unexpected data)
 */
export function normalizeDepartment(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const s = String(value).trim();
  if (!s) return 'N/A';
  if (isNA(s)) return 'N/A';
  const key = aliasKey(s);
  if (key && DEPARTMENT_ALIASES[key]) return DEPARTMENT_ALIASES[key];
  return s;
}

import { normalizeDiscipline } from './disciplines';

/**
 * Generic field-aware normalizer. Use this when iterating filter values
 * dynamically by column name so the right canonicalizer is applied.
 */
export function normalizeField(field: string, value: unknown): string {
  if (field === 'department') return normalizeDepartment(value);
  if (field === 'discipline') return normalizeDiscipline(value);
  return normalizeNA(value);
}

export { normalizeDiscipline };
