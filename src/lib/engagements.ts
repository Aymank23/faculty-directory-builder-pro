// Repair helper for Professional Engagement Activities. Mirrors the column-shift
// fixes already applied to qualifications and services. Legacy CV imports stored
// the period in `activity`, the activity in `details`, and narrative noise (e.g.
// "(Since Fall 2020 – listed from most recent to last)") in `from_to`.

import { cleanCvValue } from './cvNoise';

export interface RawEngagement {
  activity?: string | null;
  engagement_type?: string | null;
  from_to?: string | null;
  description?: string | null;
  details?: string | null;
  year?: number | string | null;
  [k: string]: unknown;
}

export interface RepairedEngagement {
  activity: string | null;
  engagement_type: string | null;
  from_to: string | null;
  description: string | null;
  details: string | null;
  year: number | null;
}

const YEAR_RE = /\b(19|20)\d{2}\b/;
const PERIOD_RE = /(\b(19|20)\d{2}\b\s*[-–—]\s*\b(19|20)\d{2}\b|\b(19|20)\d{2}\b\s*[-–—]\s*(present|now|current|today)|\b(19|20)\d{2}\s*[-–—]\s*$|since\s+\w+\s+\d{4})/i;

function looksLikePeriod(value: unknown): boolean {
  const s = cleanCvValue(value);
  if (!s) return false;
  return PERIOD_RE.test(s) || /^\d{4}\s*[-–—]\s*\d{4}$/.test(s) || /^\d{4}$/.test(s) || /^\d{4}\s*[-–—]\s*(present|current|now)$/i.test(s);
}

function extractYear(value: unknown): number | null {
  const s = cleanCvValue(value);
  if (!s) return null;
  const m = s.match(YEAR_RE);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1900 && n <= 2100 ? n : null;
}

export function repairEngagement(row: RawEngagement): RepairedEngagement {
  const activity = cleanCvValue(row.activity);
  const from_to = cleanCvValue(row.from_to);
  const description = cleanCvValue(row.description);
  const details = cleanCvValue(row.details);
  const engagement_type = cleanCvValue(row.engagement_type);

  let outActivity: string | null = activity;
  let outFromTo: string | null = from_to;
  let outDetails: string | null = details;

  // Pattern: from_to is missing/noise, but activity holds the period and details
  // holds what should be the activity. Swap them.
  if ((!outFromTo || looksLikePeriod(outFromTo) === false) && looksLikePeriod(activity) && details) {
    outFromTo = activity;
    outActivity = details;
    outDetails = null;
  }

  // If from_to is now noise or empty but activity itself is a period, promote it.
  if (!outFromTo && looksLikePeriod(outActivity)) {
    outFromTo = outActivity;
    outActivity = outDetails;
    outDetails = null;
  }

  const year = extractYear(outFromTo) ?? extractYear(row.year) ?? extractYear(outActivity) ?? null;

  return {
    activity: outActivity,
    engagement_type,
    from_to: outFromTo,
    description,
    details: outDetails,
    year,
  };
}
