// Shared helpers to repair / validate the Academic & Professional Qualifications
// rows. Historical CV imports shifted columns (year landed in `field_area`,
// the certification name landed in `institution`, etc.). These helpers detect
// that pattern and re-align values to the correct columns at display + save
// time, without losing data.

export interface RawQualification {
  degree_certification?: string | null;
  institution?: string | null;
  year?: number | string | null;
  field_area?: string | null;
  [k: string]: unknown;
}

export interface RepairedQualification {
  degree_certification: string | null;
  institution: string | null;
  year: number | null;
  field_area: string | null;
}

const YEAR_RE = /\b(19|20)\d{2}\b/;

export function extractYear(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1900 && value <= 2100) {
    return Math.trunc(value);
  }
  const str = String(value).trim();
  if (!str) return null;
  const m = str.match(YEAR_RE);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1900 && n <= 2100 ? n : null;
}

function isYearLike(value: unknown): boolean {
  return extractYear(value) != null && String(value ?? '').trim().length <= 6;
}

// Common certification / degree tokens used to disambiguate degree vs field
const DEGREE_TOKENS = /\b(ph\.?d|m\.?b\.?a|m\.?sc|m\.?a|b\.?sc|b\.?a|b\.?b\.?a|d\.?b\.?a|ed\.?d|j\.?d|llb|llm|diploma|certificate|certification|cert|fellow|cpa|cma|cfa|cia|cisa|frm|acca|aca|dipifr|pmp)\b/i;

function looksLikeDegree(value: unknown): boolean {
  const s = String(value ?? '').trim();
  if (!s) return false;
  return DEGREE_TOKENS.test(s);
}

/**
 * Repair a single qualification row by detecting which value is the year
 * and which value is the degree/certification, regardless of which column
 * the source data placed them in.
 */
export function repairQualification(row: RawQualification): RepairedQualification {
  const degreeRaw = row.degree_certification ?? null;
  const institutionRaw = row.institution ?? null;
  const yearRaw = row.year ?? null;
  const fieldRaw = row.field_area ?? null;

  // Pool every cell, find the year wherever it lives.
  const cells: Array<{ key: keyof RepairedQualification; value: unknown }> = [
    { key: 'degree_certification', value: degreeRaw },
    { key: 'institution', value: institutionRaw },
    { key: 'year', value: yearRaw },
    { key: 'field_area', value: fieldRaw },
  ];

  const yearCell = cells.find((c) => isYearLike(c.value));
  const year = yearCell ? extractYear(yearCell.value) : null;

  // Remaining non-year cells, preserving order.
  const remaining = cells.filter((c) => c !== yearCell).map((c) => c.value);
  const cleaned = remaining.map((v) => {
    const s = String(v ?? '').trim();
    return s && s.toLowerCase() !== 'degree / certification' && s !== '—' ? s : null;
  });

  // Try to identify the degree among remaining cells using token heuristics.
  const degreeIdx = cleaned.findIndex((v) => looksLikeDegree(v));
  let degree: string | null = null;
  let institution: string | null = null;
  let field: string | null = null;

  if (degreeIdx >= 0) {
    degree = cleaned[degreeIdx];
    const others = cleaned.filter((_, i) => i !== degreeIdx);
    // First non-empty becomes institution, second becomes field/area.
    institution = others[0] ?? null;
    field = others[1] ?? null;
  } else {
    // Fallback: keep original ordering of non-year cells.
    [degree, institution, field] = [cleaned[0] ?? null, cleaned[1] ?? null, cleaned[2] ?? null];
  }

  return {
    degree_certification: degree,
    institution,
    year,
    field_area: field,
  };
}

/**
 * Validate a qualification before persistence. Returns a list of human-readable
 * issues. Empty array = OK.
 */
export function validateQualification(row: RepairedQualification): string[] {
  const issues: string[] = [];
  if (!row.degree_certification) issues.push('Missing degree / certification');
  if (row.year != null && (row.year < 1900 || row.year > new Date().getFullYear() + 5)) {
    issues.push(`Year ${row.year} is out of range`);
  }
  return issues;
}
