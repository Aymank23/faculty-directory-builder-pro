import { describe, it, expect } from 'vitest';
import { ineligibilityReason, pointsFor } from '@/lib/table81';

const base = { id: 'a', verification_status: 'verified', eligibility: 'include', historical_reporting_type: 'Peer-Reviewed Journal', scholarship_portfolio: 'Basic or Discovery' };

describe('archived ICs and confirmed-only co-author counts', () => {
  it('an archived IC never enters Table 8.1', () => {
    expect(ineligibilityReason({ ...base, archived_at: '2026-11-18' })).toBe('Archived');
  });
  it('a suggested (unconfirmed) co-author is not in the denominator', () => {
    const authors = [
      { canonical_ic_id: 'a', faculty_id: 'f1', link_status: 'confirmed', department_snapshot: 'Marketing' },
      { canonical_ic_id: 'a', faculty_id: 'f2', link_status: 'proposed', department_snapshot: 'Marketing' },
    ] as any;
    expect(pointsFor(authors, 'a', 'f1').schoolPoints).toBe(1);
  });
  it('confirming the co-author splits school points 1/2', () => {
    const authors = [
      { canonical_ic_id: 'a', faculty_id: 'f1', link_status: 'confirmed', department_snapshot: 'Marketing' },
      { canonical_ic_id: 'a', faculty_id: 'f2', link_status: 'confirmed', department_snapshot: 'Finance and Accounting' },
    ] as any;
    const p = pointsFor(authors, 'a', 'f1');
    expect(p.schoolPoints).toBe(0.5);
    expect(p.departmentPoints).toBe(1);
  });
});
