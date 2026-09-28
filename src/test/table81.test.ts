import { describe, it, expect } from 'vitest';
import {
  scenarioPoints, pointsFor, deriveTable81Type, normalizePortfolio, buildTable81,
  table81Reconciles, ineligibilityReason, totalSchoolPoints, type IcAuthor, type CanonicalIc,
} from '@/lib/table81';

const r2 = (n: number) => Math.round(n * 100) / 100;

describe('Tutorial point scenarios', () => {
  it.each([
    [1, 1, 1.0, 1.0],
    [2, 2, 0.5, 0.5],
    [3, 2, 0.33, 0.5],
    [4, 1, 0.25, 1.0],
  ])('%i AKSOB / %i same-dept', (a, d, s, dp) => {
    const p = scenarioPoints(a, d);
    expect(r2(p.school)).toBe(s);
    expect(r2(p.department)).toBe(dp);
  });

  it('computes from ic_authors (3 authors, 2 in Finance)', () => {
    const au: IcAuthor[] = [
      { canonical_ic_id: 'x', faculty_id: 'f1', department_snapshot: 'Finance', link_status: 'confirmed' },
      { canonical_ic_id: 'x', faculty_id: 'f2', department_snapshot: 'Finance', link_status: 'confirmed' },
      { canonical_ic_id: 'x', faculty_id: 'f3', department_snapshot: 'Marketing', link_status: 'confirmed' },
      { canonical_ic_id: 'x', faculty_id: 'f4', department_snapshot: 'Finance', link_status: 'proposed' },
    ];
    const p = pointsFor(au, 'x', 'f1');
    expect(p.aksobAuthors).toBe(3);
    expect(r2(p.schoolPoints)).toBe(0.33);
    expect(p.departmentPoints).toBe(0.5);
    expect(pointsFor(au, 'x', 'f3').departmentPoints).toBe(1);
    expect(pointsFor(au, 'x', 'f4').schoolPoints).toBe(0); // proposed link earns nothing
  });
});

describe('Derived classification', () => {
  it('maps historical → Table 8.1', () => {
    expect(deriveTable81Type('Peer-Reviewed Journals')).toBe('Peer-Reviewed Journal Articles');
    expect(deriveTable81Type('Case Studies')).toBe('Additional Peer-/Editorial-Reviewed ICs');
    expect(deriveTable81Type('Other IC Type Selected by the School')).toBe('All Other ICs');
    expect(deriveTable81Type('Needs Review')).toBeNull();
  });
  it('normalises portfolio labels and rejects garbage', () => {
    expect(normalizePortfolio('Pedagogical/Teaching Scholarship')).toBe('Pedagogy / Teaching & Learning');
    expect(normalizePortfolio('Applied/Integration Scholarship (PA)')).toBe('Applied / Integration');
    expect(normalizePortfolio('Srour, F. Jordan, and Silva Karkoulian. "Exploring diversity through machine learning: a case for the use"')).toBeNull();
  });
});

describe('Table 8.1 eligibility and reconciliation', () => {
  const base = { verification_status: 'verified', eligibility: 'include', historical_reporting_type: 'Peer-Reviewed Journals', scholarship_portfolio: 'Basic/Discovery Scholarship' };
  const ics: CanonicalIc[] = [
    { id: 'a', ...base },
    { id: 'b', ...base, scholarship_portfolio: 'Applied/Integration Scholarship', historical_reporting_type: 'Case Studies' },
    { id: 'c', ...base, verification_status: 'under_review' },
    { id: 'd', ...base, eligibility: 'conditional' },
    { id: 'e', ...base, activity_type: 'Working Paper', historical_reporting_type: 'Other IC Type Selected by the School', doi: null },
    { id: 'f', ...base, verification_status: 'excluded' },
  ];
  const au: IcAuthor[] = [
    { canonical_ic_id: 'a', faculty_id: 'f1', department_snapshot: 'Finance', link_status: 'confirmed' },
    { canonical_ic_id: 'a', faculty_id: 'f2', department_snapshot: 'Finance', link_status: 'confirmed' },
    { canonical_ic_id: 'b', faculty_id: 'f2', department_snapshot: 'Finance', link_status: 'confirmed' },
    ...['c', 'd', 'e', 'f'].map((id) => ({ canonical_ic_id: id, faculty_id: 'f1', department_snapshot: 'Finance', link_status: 'confirmed' })),
  ];
  const disc = (f: string) => (f === 'f1' ? 'FIN' : 'FIN');

  it('counts only eligible ICs, shared IC once', () => {
    const t = buildTable81(ics, au, disc);
    expect(t.totals.total).toBe(2);
    expect(t.rows[0].portfolio).toEqual({ basic: 1, applied: 1, pedagogy: 0, total: 2 });
    expect(table81Reconciles(t.rows)).toBe(true);
    expect(totalSchoolPoints(ics, au)).toBe(2);
  });
  it('explains exclusions', () => {
    expect(ineligibilityReason(ics[2])).toBe('Under Review');
    expect(ineligibilityReason(ics[3])).toBe('Conditional — unresolved');
    expect(ineligibilityReason(ics[4])).toBe('Working paper without DOI (D-3)');
    expect(ineligibilityReason(ics[5])).toBe('Excluded');
  });

  it('D-8: splits an IC equally across distinct author disciplines, summing to 1', () => {
    const au2: IcAuthor[] = [
      { canonical_ic_id: 'a', faculty_id: 'f1', department_snapshot: 'Finance', link_status: 'confirmed' },
      { canonical_ic_id: 'a', faculty_id: 'f2', department_snapshot: 'Finance', link_status: 'confirmed' },
      { canonical_ic_id: 'a', faculty_id: 'f3', department_snapshot: 'Marketing', link_status: 'confirmed' },
      { canonical_ic_id: 'a', faculty_id: 'f4', department_snapshot: 'Marketing', link_status: 'proposed' },
    ];
    const d = (f: string) => (f === 'f3' || f === 'f4' ? 'MKT' : 'FIN');
    const t = buildTable81([ics[0]], au2, d);
    expect(t.totals.total).toBeCloseTo(1);
    expect(t.rows.map((r) => [r.discipline, r.portfolio.total])).toEqual([['FIN', 0.5], ['MKT', 0.5]]);
    expect(table81Reconciles(t.rows, t.counted.length)).toBe(true);
    // school points unchanged: 3 confirmed authors -> 1/3 each
    expect(pointsFor(au2, 'a', 'f1').schoolPoints).toBeCloseTo(1 / 3);
    const three = buildTable81([ics[0]], au2, (f) => ({ f1: 'FIN', f2: 'ECO', f3: 'MKT' } as any)[f] || 'X');
    expect(three.rows.every((r) => Math.abs(r.portfolio.total - 1 / 3) < 1e-9)).toBe(true);
  });
});
