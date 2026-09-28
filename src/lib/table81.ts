// V2 shared reporting layer — the ONLY place that decides Table 8.1 membership,
// derived reporting type, scholarship portfolio and IC point allocation.
// Chain: Original CV Item Type → Historical AKSOB reporting type → Table 8.1 type (derived, never edited).

export const TABLE81_TYPES = [
  'Peer-Reviewed Journal Articles',
  'Additional Peer-/Editorial-Reviewed ICs',
  'All Other ICs',
] as const;
export type Table81Type = (typeof TABLE81_TYPES)[number];

export const PORTFOLIOS = ['Basic / Discovery', 'Applied / Integration', 'Pedagogy / Teaching & Learning'] as const;
export type Portfolio = (typeof PORTFOLIOS)[number];

/** Historical AKSOB reporting type → derived Table 8.1 type. Unlisted / Needs Review → null (ineligible). */
const HISTORICAL_TO_81: Record<string, Table81Type> = {
  'Peer-Reviewed Journals': 'Peer-Reviewed Journal Articles',
  'Editorial-Reviewed Journals and Articles': 'Additional Peer-/Editorial-Reviewed ICs',
  'Peer-Reviewed Academic/Professional Meeting Proceedings': 'Additional Peer-/Editorial-Reviewed ICs',
  'Academic/Professional Meeting Presentations': 'Additional Peer-/Editorial-Reviewed ICs',
  'Competitive Research Awards Received': 'Additional Peer-/Editorial-Reviewed ICs',
  'Competitive Research Grants Received': 'Additional Peer-/Editorial-Reviewed ICs',
  Textbooks: 'Additional Peer-/Editorial-Reviewed ICs',
  'Case Studies': 'Additional Peer-/Editorial-Reviewed ICs',
  'Professional Practice Standards or Public Policy': 'Additional Peer-/Editorial-Reviewed ICs',
  'Scholarly Book': 'Additional Peer-/Editorial-Reviewed ICs',
  'Scholarly Book Chapter': 'Additional Peer-/Editorial-Reviewed ICs',
  'Book Review': 'Additional Peer-/Editorial-Reviewed ICs',
  'Letter to Editor': 'Additional Peer-/Editorial-Reviewed ICs',
  'Other IC Type Selected by the School': 'All Other ICs',
};

export const HISTORICAL_TYPES = [...Object.keys(HISTORICAL_TO_81), 'Needs Review', 'Not Applicable'];

export function deriveTable81Type(historical?: string | null): Table81Type | null {
  if (!historical) return null;
  return HISTORICAL_TO_81[historical.trim()] ?? null;
}

export function normalizePortfolio(v?: string | null): Portfolio | null {
  const s = String(v ?? '').toLowerCase();
  if (!s.trim() || s.length > 80) return null; // long free text = garbage, needs review
  if (/basic|discovery/.test(s)) return 'Basic / Discovery';
  if (/applied|integration|application/.test(s)) return 'Applied / Integration';
  if (/pedagog|teaching|learning/.test(s)) return 'Pedagogy / Teaching & Learning';
  return null;
}

export type CanonicalIc = Record<string, any> & {
  id: string;
  verification_status?: string | null;
  eligibility?: string | null;
  historical_reporting_type?: string | null;
  scholarship_portfolio?: string | null;
  activity_type?: string | null;
  doi?: string | null;
};

export type IcAuthor = {
  canonical_ic_id: string;
  faculty_id: string;
  department_snapshot?: string | null;
  link_status: 'proposed' | 'confirmed' | string;
  author_position?: number | null;
  created_at?: string;
};

/** Why an IC is (not) in Table 8.1 — surfaced in the UI so nothing silently disappears. */
export function ineligibilityReason(ic: CanonicalIc): string | null {
  if (ic.verification_status !== 'verified') return ic.verification_status === 'excluded' ? 'Excluded' : 'Under Review';
  if (ic.eligibility === 'exclude') return 'Excluded by crosswalk';
  if (ic.eligibility !== 'include') return 'Conditional — unresolved';
  if (!deriveTable81Type(ic.historical_reporting_type)) return 'Reporting type needs review';
  if (!normalizePortfolio(ic.scholarship_portfolio)) return 'Scholarship portfolio missing';
  if (/working paper/i.test(ic.activity_type || '') && !String(ic.doi || '').trim()) return 'Working paper without DOI (D-3)';
  return null;
}

export const isTable81Eligible = (ic: CanonicalIc) => ineligibilityReason(ic) === null;

// ── Points ──────────────────────────────────────────────────────────────────
export function confirmedAuthors(authors: IcAuthor[], icId: string): IcAuthor[] {
  return authors.filter((a) => a.canonical_ic_id === icId && a.link_status === 'confirmed');
}

/** School Points = 1 / AKSOB authors; Department Points = 1 / same-department AKSOB authors. */
export function pointsFor(authors: IcAuthor[], icId: string, facultyId: string) {
  const conf = confirmedAuthors(authors, icId);
  const me = conf.find((a) => a.faculty_id === facultyId);
  const aksob = conf.length;
  const sameDept = me ? conf.filter((a) => (a.department_snapshot || '') === (me.department_snapshot || '')).length : 0;
  return {
    aksobAuthors: aksob,
    sameDeptAuthors: sameDept,
    schoolPoints: me && aksob ? 1 / aksob : 0,
    departmentPoints: me && sameDept ? 1 / sameDept : 0,
  };
}

/** Pure scenario helper (used by tests / docs). */
export const scenarioPoints = (aksob: number, sameDept: number) => ({ school: 1 / aksob, department: 1 / sameDept });

/**
 * Discipline an IC is reported under in Table 8.1: the discipline of its primary confirmed author
 * (lowest author_position, then earliest link). Guarantees each IC appears in exactly one row.
 */
export function primaryAuthor(authors: IcAuthor[], icId: string): IcAuthor | null {
  const conf = confirmedAuthors(authors, icId).sort(
    (a, b) => (a.author_position ?? 999) - (b.author_position ?? 999) || String(a.created_at).localeCompare(String(b.created_at)),
  );
  return conf[0] ?? null;
}

export type Table81Cell = { basic: number; applied: number; pedagogy: number; total: number };
const emptyCell = (): Table81Cell => ({ basic: 0, applied: 0, pedagogy: 0, total: 0 });
const portfolioKey = (p: Portfolio): keyof Omit<Table81Cell, 'total'> =>
  p === 'Basic / Discovery' ? 'basic' : p === 'Applied / Integration' ? 'applied' : 'pedagogy';

export type Table81Row = {
  discipline: string;
  portfolio: Table81Cell;
  byType: Record<Table81Type, Table81Cell>;
  icIds: string[];
};

/** Builds Table 8.1 from canonical ICs. Only eligible ICs with ≥1 confirmed author are counted, each exactly once. */
export function buildTable81(ics: CanonicalIc[], authors: IcAuthor[], disciplineOf: (facultyId: string) => string | null) {
  const rows = new Map<string, Table81Row>();
  const counted: CanonicalIc[] = [];
  for (const ic of ics) {
    if (!isTable81Eligible(ic)) continue;
    const pa = primaryAuthor(authors, ic.id);
    if (!pa) continue;
    const disc = disciplineOf(pa.faculty_id) || 'Unassigned';
    const type = deriveTable81Type(ic.historical_reporting_type)!;
    const pk = portfolioKey(normalizePortfolio(ic.scholarship_portfolio)!);
    if (!rows.has(disc)) {
      rows.set(disc, {
        discipline: disc,
        portfolio: emptyCell(),
        byType: Object.fromEntries(TABLE81_TYPES.map((t) => [t, emptyCell()])) as Record<Table81Type, Table81Cell>,
        icIds: [],
      });
    }
    const r = rows.get(disc)!;
    r.portfolio[pk]++; r.portfolio.total++;
    r.byType[type][pk]++; r.byType[type].total++;
    r.icIds.push(ic.id);
    counted.push(ic);
  }
  const list = [...rows.values()].sort((a, b) => a.discipline.localeCompare(b.discipline));
  const totals = emptyCell();
  list.forEach((r) => { totals.basic += r.portfolio.basic; totals.applied += r.portfolio.applied; totals.pedagogy += r.portfolio.pedagogy; totals.total += r.portfolio.total; });
  return { rows: list, totals, counted };
}

/** Invariant check used by tests and the UI "reconciled" badge. */
export function table81Reconciles(rows: Table81Row[]): boolean {
  return rows.every((r) => {
    const p = r.portfolio;
    const byTypeSum = TABLE81_TYPES.reduce((s, t) => s + r.byType[t].total, 0);
    return p.basic + p.applied + p.pedagogy === p.total && byTypeSum === p.total && r.icIds.length === p.total;
  });
}

export function quartileBucket(q?: string | null): 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Unranked / N.A.' {
  const m = String(q || '').toUpperCase().match(/Q[1-4]/);
  return (m ? m[0] : 'Unranked / N.A.') as any;
}

export function totalSchoolPoints(ics: CanonicalIc[], authors: IcAuthor[]): number {
  // Every eligible IC with ≥1 confirmed author is worth exactly 1 school point in total.
  return ics.filter((ic) => isTable81Eligible(ic) && confirmedAuthors(authors, ic.id).length > 0).length;
}
