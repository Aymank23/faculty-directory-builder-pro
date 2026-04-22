// Shared helpers to repair / validate Service Contributions rows.
// Historical CV imports column-shifted services so that a year ended up in
// `level`, the level word ("School"/"University"/"Department") ended up in
// `committee_role`, and the actual committee/role text was lost or pushed
// into `from_to`. These helpers detect that pattern and re-align values to
// the correct columns at display time.

export interface RawService {
  from_to?: string | null;
  level?: string | null;
  committee_role?: string | null;
  year?: number | string | null;
  description?: string | null;
  contribution_type?: string | null;
  [k: string]: unknown;
}

export interface RepairedService {
  from_to: string | null;
  level: string | null;
  committee_role: string | null;
  year: number | null;
}

const YEAR_RE = /\b(19|20)\d{2}\b/;
const PERIOD_RE = /(\b(19|20)\d{2}\b.*\b(19|20)\d{2}\b|\b(19|20)\d{2}\b\s*[-–—]\s*(present|now|today)|\b(19|20)\d{2}\b\s*[-–—]\s*$|since\s+\w+\s+\d{4}|fall\s+\d{4}|spring\s+\d{4}|summer\s+\d{4})/i;
const LEVEL_TOKENS = /^(department|school|college|university|national|international|community|professional|industry)$/i;

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === '—' || s === '-') return null;
  return s;
}

function extractYear(value: unknown): number | null {
  const s = clean(value);
  if (!s) return null;
  const m = s.match(YEAR_RE);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1900 && n <= 2100 ? n : null;
}

function looksLikeYearOnly(value: unknown): boolean {
  const s = clean(value);
  if (!s) return false;
  return /^\d{4}$/.test(s) && extractYear(s) !== null;
}

function looksLikeLevel(value: unknown): boolean {
  const s = clean(value);
  if (!s) return false;
  return LEVEL_TOKENS.test(s);
}

function looksLikePeriod(value: unknown): boolean {
  const s = clean(value);
  if (!s) return false;
  return PERIOD_RE.test(s) || /^\d{4}\s*[-–—]\s*\d{4}$/.test(s) || /^\d{4}\s+till\s+now$/i.test(s);
}

/**
 * Repair a single service contribution row by figuring out which value is
 * the period (from_to), which is the level, and which is the committee/role,
 * regardless of which column the source data placed them in.
 */
export function repairService(row: RawService): RepairedService {
  const cells = [
    { key: 'from_to', value: clean(row.from_to) },
    { key: 'level', value: clean(row.level) },
    { key: 'committee_role', value: clean(row.committee_role) },
  ];

  let from_to: string | null = null;
  let level: string | null = null;
  let committee_role: string | null = null;

  // Pass 1 — find the level cell (single short level token).
  const levelCell = cells.find((c) => looksLikeLevel(c.value));
  if (levelCell) level = levelCell.value;

  // Pass 2 — find the period cell. Prefer obvious date ranges, fall back to
  // any cell containing a year (but skip the chosen level cell).
  const periodCell =
    cells.find((c) => c !== levelCell && looksLikePeriod(c.value)) ||
    cells.find((c) => c !== levelCell && extractYear(c.value) != null && (c.value || '').length <= 60);
  if (periodCell) from_to = periodCell.value;

  // Pass 3 — committee/role is whatever non-trivial text remains.
  const remaining = cells.filter((c) => c !== levelCell && c !== periodCell);
  const role = remaining.map((c) => c.value).filter((v): v is string => !!v && !looksLikeYearOnly(v) && !looksLikeLevel(v));
  if (role.length) committee_role = role.join(' — ');

  // If we still have no role but the period cell looks like a long sentence
  // (parenthetical narrative), promote the period back into role and clear
  // the period field.
  if (!committee_role && from_to && /^\(/.test(from_to)) {
    committee_role = from_to;
    from_to = null;
  }

  // Fallback: keep original ordering if nothing classified.
  if (!from_to && !level && !committee_role) {
    from_to = cells[0].value;
    level = cells[1].value;
    committee_role = cells[2].value;
  }

  const year = extractYear(from_to) ?? extractYear(row.year) ?? null;

  return { from_to, level, committee_role, year };
}
