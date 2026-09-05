// Single source of truth for the AACSB IC taxonomy:
//  - Original CV Item Type  → immutable classification captured from the source CV
//  - IC Reporting Type      → editable AACSB reporting bucket (admin can change)
//  - record_class           → 'ic' (counts toward IC totals) | 'academic_engagement'
//
// Rules:
//  * original_cv_item_type is written once at import and NEVER overwritten.
//  * ic_reporting_type is derived once via mapOriginalToReportingType() and is
//    then freely editable by admins.
//  * Academic Engagement records stay visible on the profile but never count as ICs.

export const IC_REPORTING_TYPES = [
  'Peer-Reviewed Journals',
  'Editorial-Reviewed Journals and Articles',
  'Peer-Reviewed Academic/Professional Meeting Proceedings',
  'Academic/Professional Meeting Presentations',
  'Competitive Research Awards Received',
  'Textbooks',
  'Case Studies',
  'Professional Practice Standards or Public Policy',
  'Other IC Type Selected by the School',
  'Not Applicable',
  'Needs Review',
] as const;

export type IcReportingType = (typeof IC_REPORTING_TYPES)[number];

/** Basic / Applied / Pedagogical — kept as a SEPARATE dimension from reporting type. */
export const IC_SCHOLARSHIP_CATEGORIES = [
  'Basic/Discovery Scholarship',
  'Applied/Integration Scholarship',
  'Pedagogical/Teaching Scholarship',
] as const;

export const VERIFICATION_STATUSES = ['verified', 'under_review', 'excluded'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verified',
  under_review: 'Under Review',
  excluded: 'Excluded',
};

export const RECORD_CLASSES = ['ic', 'academic_engagement'] as const;
export type RecordClass = (typeof RECORD_CLASSES)[number];

// ── Original CV item types seen in the AACSB Academic / Practitioner templates ──
export const ORIGINAL_CV_ITEM_TYPES = [
  'Peer-Reviewed Journals',
  'Academic Conference Proceeding',
  'Academic Conference Paper Presentation',
  'Academic Conference Keynote Speaker',
  'Publication in Reputed Practice-Oriented Journals',
  'Book Review in PRJ',
  'Published Letter to PRJ Editor',
  'International Research Recognition Award',
  'Textbook',
  'Case Studies',
  'Books',
  'Scholarly Book',
  'Chapters in Edited Books',
  'Chapter in Scholarly Books, Annals or Monographs',
  'Editorial Position',
  'Working Paper',
  'Developing Accreditation Standards, Curriculum Guidelines or Academic Frameworks',
  'Grant',
  'Journal Reviewer',
  'Guest Lectures or Workshops',
  'Consulting Services',
  'Others',
] as const;

function norm(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Explicit initial mapping (requirement 7).
const REPORTING_MAP: Array<[RegExp, IcReportingType]> = [
  [/^peer reviewed journals?$|^prjs?$|peer reviewed journal articles?/, 'Peer-Reviewed Journals'],
  [/academic conference proceeding|conference proceedings?/, 'Peer-Reviewed Academic/Professional Meeting Proceedings'],
  [/academic conference paper presentation|paper presentation/, 'Academic/Professional Meeting Presentations'],
  [/keynote speaker/, 'Academic/Professional Meeting Presentations'],
  [/practice oriented journals?/, 'Editorial-Reviewed Journals and Articles'],
  [/book review in prj/, 'Editorial-Reviewed Journals and Articles'],
  [/published letter to prj editor|letter to (the )?editor/, 'Editorial-Reviewed Journals and Articles'],
  [/international research recognition award|research recognition award/, 'Competitive Research Awards Received'],
  [/^textbooks?$/, 'Textbooks'],
  [/^case stud(y|ies)$/, 'Case Studies'],
  [/^books?$/, 'Other IC Type Selected by the School'],
  [/scholarly book(?!s, annals)/, 'Other IC Type Selected by the School'],
  [/^chapters?$|chapters? in edited books?/, 'Other IC Type Selected by the School'],
  [/chapter in scholarly books/, 'Other IC Type Selected by the School'],
  [/editorial position/, 'Other IC Type Selected by the School'],
  [/working paper/, 'Other IC Type Selected by the School'],
  [/professional practice standards|public policy/, 'Professional Practice Standards or Public Policy'],
];

/** Types the school must review before assigning a final bucket. */
const NEEDS_REVIEW_MAP: RegExp[] = [
  /developing accreditation standards|curriculum guidelines|academic frameworks/,
  /^grants?$/,
  /^others?$/,
];

/**
 * Original CV item types that belong to Academic Engagement, not ICs (requirement 8).
 * Matched against the item type AND, as a fallback, the record details.
 */
const ACADEMIC_ENGAGEMENT_TYPE_PATTERNS: RegExp[] = [
  /journal reviewer/,
  /developing accreditation standards|curriculum guidelines|academic frameworks/,
  /guest lectures? or workshops?/,
  /reviewer for/,
];

const ACADEMIC_ENGAGEMENT_DETAIL_PATTERNS: RegExp[] = [
  /attended (the |a |an )?.*(conference|seminar|workshop|webinar|summit|symposium)/,
  /(conference|seminar|workshop) (chair|organizer|organiser|committee member)/,
  /(chaired|organized|organised) (the )?(a |an )?(conference|seminar|research workshop|workshop)/,
  /(reader|supervisor|advisor) (for|of) .*(graduate|master|phd|doctoral|thesis|capstone)/,
  /reviewed .*(paper|manuscript) for/,
  /guest lecture|guest speaker|workshop conducted|panel discussion/,
  /training on (online|hybrid) courses?|online teaching training/,
  /(designing|designed|delivering|delivered) .*(online|hybrid) course/,
  /curriculum (development|design|review)|develop(ed|ing)? the .*(minor|major|curriculum|program)/,
  /accreditation (standards|related|activities|framework)/,
];

/** Maps an Original CV Item Type to the initial IC Reporting Type. */
export function mapOriginalToReportingType(originalType?: string | null): IcReportingType {
  const n = norm(originalType);
  if (!n) return 'Needs Review';
  if (NEEDS_REVIEW_MAP.some((re) => re.test(n))) return 'Needs Review';
  for (const [re, target] of REPORTING_MAP) {
    if (re.test(n)) return target;
  }
  return 'Needs Review';
}

/**
 * Decides whether a parsed contribution is a true IC or an Academic Engagement
 * activity. Section origin wins; item type and details are used as fallbacks.
 */
export function classifyRecordClass(input: {
  originalType?: string | null;
  sourceSection?: string | null;
  details?: string | null;
}): RecordClass {
  const section = norm(input.sourceSection);
  if (/academic engagement/.test(section)) return 'academic_engagement';
  if (/^prjs?$|peer reviewed journal|books|chapters/.test(section)) {
    // PRJ / book / chapter tables are always ICs.
    return 'ic';
  }

  const type = norm(input.originalType);
  if (ACADEMIC_ENGAGEMENT_TYPE_PATTERNS.some((re) => re.test(type))) return 'academic_engagement';

  const details = norm(input.details);
  if (details && ACADEMIC_ENGAGEMENT_DETAIL_PATTERNS.some((re) => re.test(details))) return 'academic_engagement';

  return 'ic';
}

// ── Canonical (shared publication) key ───────────────────────────────────────

export function normalizeDoiValue(doi?: string | null): string | null {
  if (!doi) return null;
  const m = String(doi).match(/10\.\d{4,9}\/\S+/);
  if (!m) return null;
  return m[0].replace(/[.,;)\]]+$/, '').toLowerCase();
}

export function normalizeTitleValue(title?: string | null): string | null {
  if (!title) return null;
  const t = String(title)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return t.length >= 8 ? t : null;
}

/**
 * Canonical key used to recognise the SAME publication across faculty CVs.
 * Priority: DOI → normalized title + year → normalized title.
 */
export function buildCanonicalKey(record: {
  doi?: string | null;
  title?: string | null;
  apa_citation?: string | null;
  year?: number | string | null;
}): string | null {
  const doi = normalizeDoiValue(record.doi);
  if (doi) return `doi:${doi}`;
  const title = normalizeTitleValue(record.title || record.apa_citation);
  if (!title) return null;
  const year = record.year ? String(record.year).match(/(19|20)\d{2}/)?.[0] : null;
  return year ? `ty:${title}:${year}` : `t:${title}`;
}

/** True when the record may enter final school-level reporting totals. */
export function isReportableIc(record: {
  record_class?: string | null;
  verification_status?: string | null;
  ic_reporting_type?: string | null;
}): boolean {
  if ((record.record_class || 'ic') !== 'ic') return false;
  if (record.verification_status !== 'verified') return false;
  if (record.ic_reporting_type === 'Not Applicable' || record.ic_reporting_type === 'Needs Review') return false;
  return true;
}

/**
 * School-level count: reportable ICs deduplicated by canonical key so a
 * publication shared by several faculty counts exactly once.
 */
export function countCanonicalIcs(records: Array<Record<string, any>>): number {
  const seen = new Set<string>();
  let count = 0;
  for (const r of records) {
    if (!isReportableIc(r)) continue;
    const key = r.canonical_key || buildCanonicalKey(r);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    count++;
  }
  return count;
}
