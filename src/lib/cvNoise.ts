// Single source of truth for "noise" strings that should never be persisted
// or displayed as real CV data. These are narrative section headers / parsing
// artifacts that legacy imports captured as values (e.g. inside `from_to`,
// `committee_role`, `activity`, etc.).
//
// Rule: if a value matches `isCvNoise`, it must be treated as null at every
// layer — parser output, UI display, and write-side validation.

const NOISE_PATTERNS: RegExp[] = [
  /listed\s+from\s+most\s+recent/i,
  /most\s+recent\s+to\s+last/i,
  /^[\(\[].*listed.*[\)\]]$/i,
  /click\s+or\s+tap\s+here/i,
  /choose\s+an\s+item/i,
  /enter\s+(year|text|date)\.?$/i,
  /documentation\s+is\s+needed\s+for\s+every\s+item/i,
  /^[—\-–\s]+$/,
];

export function isCvNoise(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return NOISE_PATTERNS.some((re) => re.test(s));
}

/** Returns the trimmed string, or null if empty / noise / placeholder. */
export function cleanCvValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (isCvNoise(s)) return null;
  return s;
}
