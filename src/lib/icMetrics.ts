// Centralised classification / counting / status service.
// EVERY dashboard, profile view, report and export must use these helpers.
// Do not re-implement IC counting or status rules inline in a page.

import {
  buildCanonicalKey,
  isReportableIc as isReportableIcRaw,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
} from './icTaxonomy';

export type IcRecord = Record<string, any>;

/**
 * Authoritative verification status.
 * `verification_status` (verified | under_review | excluded) is the single source
 * of truth. The legacy `status` column is only consulted when the new field is
 * empty on an old row, and is never written by new code.
 */
export function verificationStatusOf(record: IcRecord): VerificationStatus {
  const raw = String(record?.verification_status || '').trim();
  if ((VERIFICATION_STATUSES as readonly string[]).includes(raw)) return raw as VerificationStatus;
  const legacy = String(record?.status || '').trim();
  if (legacy === 'verified') return 'verified';
  if (legacy === 'rejected' || legacy === 'excluded') return 'excluded';
  return 'under_review';
}

export function verificationLabel(record: IcRecord): string {
  return VERIFICATION_STATUS_LABELS[verificationStatusOf(record)];
}

export function verificationVariant(record: IcRecord): 'default' | 'secondary' | 'destructive' {
  const s = verificationStatusOf(record);
  if (s === 'verified') return 'default';
  if (s === 'excluded') return 'destructive';
  return 'secondary';
}

/** Record class helpers — Academic Engagement lives in the same table but is never an IC. */
export function isIc(record: IcRecord): boolean {
  return (record?.record_class || 'ic') === 'ic';
}

export function isAcademicEngagement(record: IcRecord): boolean {
  return record?.record_class === 'academic_engagement';
}

export function onlyIcs(records: IcRecord[]): IcRecord[] {
  return records.filter(isIc);
}

export function onlyAcademicEngagement(records: IcRecord[]): IcRecord[] {
  return records.filter(isAcademicEngagement);
}

/**
 * Eligibility for final AACSB IC totals — all four conditions must hold:
 *  record class = ic, verification = verified, reporting type set and neither
 *  "Needs Review" nor "Not Applicable".
 */
export function isEligibleIc(record: IcRecord): boolean {
  return isReportableIcRaw({
    record_class: record?.record_class,
    verification_status: verificationStatusOf(record),
    ic_reporting_type: record?.ic_reporting_type,
  });
}

export function eligibleIcs(records: IcRecord[]): IcRecord[] {
  return records.filter(isEligibleIc);
}

export function canonicalKeyOf(record: IcRecord): string | null {
  return record?.canonical_key || buildCanonicalKey(record);
}

/**
 * School-level / cross-faculty count: eligible ICs deduplicated by canonical key,
 * so a publication shared by several AKSOB faculty counts exactly once while
 * remaining visible on each profile.
 */
export function countSchoolIcs(records: IcRecord[]): number {
  return dedupeSharedIcs(records).length;
}

/** Eligible ICs with shared publications collapsed to one representative row. */
export function dedupeSharedIcs(records: IcRecord[]): IcRecord[] {
  const seen = new Set<string>();
  const out: IcRecord[] = [];
  for (const r of eligibleIcs(records)) {
    const key = canonicalKeyOf(r);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(r);
  }
  return out;
}

/** True when this eligible IC is shared with at least one other faculty record. */
export function buildSharedKeySet(records: IcRecord[]): Set<string> {
  const counts = new Map<string, Set<string>>();
  for (const r of records) {
    const key = canonicalKeyOf(r);
    if (!key) continue;
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key)!.add(String(r.faculty_id || ''));
  }
  const shared = new Set<string>();
  counts.forEach((facs, key) => {
    if (facs.size > 1) shared.add(key);
  });
  return shared;
}

export function isSharedRecord(record: IcRecord, sharedKeys: Set<string>): boolean {
  const key = canonicalKeyOf(record);
  return !!key && sharedKeys.has(key);
}

/** Counting helpers used by KPI cards so every page reports the same numbers. */
export function icStats(records: IcRecord[]) {
  const ics = onlyIcs(records);
  const eligible = eligibleIcs(ics);
  return {
    allIcRecords: ics,
    academicEngagement: onlyAcademicEngagement(records),
    eligible,
    eligibleCount: eligible.length,
    schoolCount: countSchoolIcs(ics),
    verified: ics.filter((r) => verificationStatusOf(r) === 'verified'),
    underReview: ics.filter((r) => verificationStatusOf(r) === 'under_review'),
    excluded: ics.filter((r) => verificationStatusOf(r) === 'excluded'),
    needsReportingType: ics.filter((r) => (r.ic_reporting_type || 'Needs Review') === 'Needs Review'),
  };
}

/** Group eligible ICs by an arbitrary key, deduplicating shared publications. */
export function groupEligible(records: IcRecord[], keyFn: (r: IcRecord) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of dedupeSharedIcs(records)) {
    const k = keyFn(r) || 'Unspecified';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export { VERIFICATION_STATUSES, VERIFICATION_STATUS_LABELS };
export type { VerificationStatus };
