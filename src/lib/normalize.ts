// Shared normalization helpers used across dashboards & filters.

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
