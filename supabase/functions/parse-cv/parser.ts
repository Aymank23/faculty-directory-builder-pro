export type RowStatus = "ready" | "ignored_placeholder" | "rejected_header" | "needs_review";

export type ReviewedRow<T = Record<string, unknown>> = {
  raw: string;
  status: RowStatus;
  issues: string[];
  data: T | null;
  section: string;
  subtype?: string;
};

type HeaderPattern = RegExp | RegExp[];

type SectionSummary = {
  detected: boolean;
  headerDetected: boolean;
  parsedCount: number;
  empty: boolean;
  skipped: boolean;
  skipReason?: string;
  ready: number;
  ignored_placeholder: number;
  rejected_header: number;
  needs_review: number;
};

export type ParseCvResponse = {
  ok: boolean;
  data?: {
    cv_type: string;
    personal_info: Record<string, string | null>;
    qualifications: Array<Record<string, unknown>>;
    intellectual_contributions: Array<Record<string, unknown>>;
    engagements: Array<Record<string, unknown>>;
    services: Array<Record<string, unknown>>;
    awards: Array<Record<string, unknown>>;
    professional_experience: Array<Record<string, unknown>>;
    academic_engagement: Array<Record<string, unknown>>;

  };
  warnings?: string[];
  error?: string;
  fallback?: boolean;
  diagnostics?: {
    sections_detected?: string[];
    sections_empty?: string[];
    sections_parsed?: string[];
    sections_skipped?: Array<{ key: string; reason?: string }>;
    section_summary?: Record<string, SectionSummary>;
    review_sections?: Record<string, ReturnType<typeof groupReviewedRows>>;
    validation_summary?: { ready?: number; needs_review?: number; rejected_header?: number; ignored_placeholder?: number };
    text_length?: number;
    ic_count?: number;
    error_stage?: string;
  };
};

const NOISE_PATTERNS: RegExp[] = [
  /listed\s+from\s+most\s+recent/i,
  /most\s+recent\s+to\s+last/i,
  /^[\(\[].*listed.*[\)\]]$/i,
  /^[—\-–\s]+$/,
];

// Heading-driven section detection. Numbers differ between the Academic and the
// Practitioner AACSB templates, so section numbers are optional everywhere.
const MAIN_SECTION_MATCHERS: Array<{ key: string; pattern: RegExp }> = [
  { key: "personal_info", pattern: /^#*\s*\d*\.?\s*personal\s*&?\s*(and\s+)?academic information|^#*\s*1\.?\s*personal/i },
  { key: "qualifications", pattern: /academic\s*&?\s*(and\s+)?(\w+\s+)?professional\s+qualifications/i },
  { key: "professional_experience", pattern: /^#*\s*\d*\.?\s*professional experience\b/i },
  { key: "intellectual_contributions", pattern: /intellectual contributions/i },
  { key: "professional_engagement", pattern: /professional engagement activities/i },
  { key: "service", pattern: /service contributions/i },
  { key: "awards", pattern: /awards\s*&?\s*recognition/i },
];

const IC_SECTION_MATCHERS: Array<{ key: string; label: string; pattern: RegExp; icType?: string }> = [
  { key: "prjs", label: "PRJs", pattern: /peer-?reviewed journal articles|\bprjs?\b/i, icType: "PRJ" },
  { key: "books", label: "Books", pattern: /^#*\s*\d+\.?\s*\d*\.?\s*books?\b/i, icType: "Book" },
  { key: "chapters", label: "Chapters", pattern: /chapters? in edited books/i, icType: "Chapter" },
  { key: "other_ics", label: "Other ICs", pattern: /other intellectual contributions/i },
  { key: "academic_engagement", label: "Academic Engagement Activities", pattern: /academic engagement activities/i },
];


const SERVICE_LEVEL_RE = /^(department|school|college|university|community|professional|industry|national|international)$/i;
const QUARTILE_RE = /^(Q[1-4]|A\*|A|B|C|NA|N\/A)$/i;
const IC_CATEGORY_RE = /(scholarship|teaching|learning|integration|discovery|applied|practice|engagement|service)/i;
const CITATION_RE = /(doi|journal|review|vol\.|issue|pp\.|\((19|20)\d{2}\)|https?:\/\/doi\.org\/|10\.\d{4,9}\/.+)/i;
const HEADER_BLOB_RE = /(year\s*\|\s*award|from-to\s*\||degree\s*\|\s*institution|citation\s*\|\s*scopus rank)/i;

const TABLE_HEADER_PATTERNS = {
  qualifications: /^degree(?:\s*\/\s*certification)?\s*\|\s*institution\s*\|\s*(?:date\s*\/\s*year|year)\s*\|\s*field(?:\s*\/\s*area)?$/i,
  awards: /^year\s*\|\s*award(?:\s*\/\s*recognition)?\s*\|\s*institution(?:\s*\/\s*organization)?$/i,
  engagements: /^from\s*-?\s*to\s*\|\s*activity\s*\|\s*details$/i,
  service: /^from\s*-?\s*to\s*\|\s*level\s*\|\s*committee(?:\s*\/\s*role)?$/i,
  professionalExperience: /^period\s*\|\s*organization\s*\/?\s*employer\s*\|\s*position\s*\/?\s*title\s*\|\s*key responsibilities/i,
  prj: /^citation\s*\|\s*scopus\s+rank\s*\|\s*ic\s+category$/i,
  bookLike: /^citation\s*\|\s*(?:publisher(?:\s+name)?|scopus\s+rank)\s*\|\s*ic\s+category$/i,
  otherIc: [
    /^year\s*\|\s*(?:type(?:\s+of\s+contributions?)?|type|category)\s*\|\s*(?:ic\s+category|category|\[___\]|action)\s*\|\s*(?:details|description)$/i,
    /^year\s*\|\s*category\s*\|\s*\[___\]\s*\|\s*description$/i,
  ] satisfies RegExp[],
};

const SUBSTRING_PLACEHOLDERS = [
  "click or tap here to enter text",
  "click or tap here",
  "choose an item",
  "enter year",
  "enter year.",
  "click or tap to enter a date",
  "click or tap here to enter a date",
  "documentation is needed for every item listed",
];

const EXACT_PLACEHOLDERS = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "enter text",
  "enter text.",
  "[___]",
]);

function stripParenthetical(line: string) {
  return line.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function matchesHeaderPattern(line: string, pattern?: HeaderPattern) {
  if (!pattern) return false;
  return Array.isArray(pattern) ? pattern.some((re) => re.test(line)) : pattern.test(line);
}

function normalizeBrokenNumericTokens(value: string) {
  let out = value;
  const patterns: Array<[RegExp, string]> = [
    [/\b(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, "$1$2$3$4"],
    [/\b(\d{2})\s+(\d{2})\b/g, "$1$2"],
    [/\b(\d)\s+(\d{3})\b/g, "$1$2"],
    [/\b(\d{3})\s+(\d)\b/g, "$1$2"],
    [/\b(\d{2})\s+(\d)\s+(\d)\b/g, "$1$2$3"],
    [/\b(\d)\s+(\d)\s+(\d{2})\b/g, "$1$2$3"],
  ];

  for (const [pattern, replacement] of patterns) {
    out = out.replace(pattern, replacement);
  }

  return out;
}

function cleanLine(line: string) {
  return normalizeBrokenNumericTokens(
    line
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function isPlaceholder(value: unknown) {
  if (value == null || value === "") return true;
  const normalized = String(value).toLowerCase().trim().replace(/\s+/g, " ");
  if (!normalized) return true;
  const despaced = normalized.replace(/\b(\w)\s+(?=\w)/g, "$1");
  if (EXACT_PLACEHOLDERS.has(normalized) || EXACT_PLACEHOLDERS.has(despaced)) return true;
  return SUBSTRING_PLACEHOLDERS.some((p) => normalized.includes(p) || despaced.includes(p));
}

function isNoiseLine(line: string) {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

function cleanValue(value: unknown) {
  if (value == null) return null;
  const cleaned = cleanLine(String(value));
  if (!cleaned || isPlaceholder(cleaned) || isNoiseLine(cleaned)) return null;
  return cleaned;
}

function stripInlineNoise(line: string) {
  let out = line;
  out = out.replace(/\s*\([^)]*(?:listed\s+from\s+most\s+recent|most\s+recent\s+to\s+last|since\s+fall\s+\d{4}[^)]*listed[^)]*)[^)]*\)\s*/gi, " ");
  return out.replace(/\s+/g, " ").trim();
}

function looksLikeSectionHeading(line: string) {
  return MAIN_SECTION_MATCHERS.some(({ pattern }) => pattern.test(line)) || IC_SECTION_MATCHERS.some(({ pattern }) => pattern.test(line));
}

function sanitizeText(cvText: string) {
  return cvText
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanLine)
    .map((line) => {
      if (line && isNoiseLine(line) && (looksLikeSectionHeading(line) || /^#+\s/.test(line) || /\b(qualifications|awards|service|engagement|contributions|professional|recognition)\b/i.test(line))) {
        return stripInlineNoise(line);
      }
      return line;
    })
    .filter((line) => {
      if (!line) return false;
      // Only drop placeholder/noise lines when they are NOT table rows. A table
      // row may legitimately contain a placeholder cell (e.g. "Choose an item.")
      // alongside real data — those are handled per-cell downstream.
      const isTableRow = line.includes("|");
      if (!isTableRow && isPlaceholder(line)) return false;
      if (!isTableRow && isNoiseLine(line)) return false;
      if (/^w:[a-z]/i.test(line)) return false;
      if (/^[<>/\\]+$/.test(line)) return false;
      return true;
    });
}

function normalizeYear(value?: string | null) {
  if (!value) return undefined;
  const normalized = normalizeBrokenNumericTokens(value);
  const match = normalized.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function normalizeCell(value: unknown) {
  return cleanLine(String(value ?? ""));
}

function parseCells(rawLine: string) {
  return rawLine.split("|").map((cell) => normalizeCell(cell));
}

function createRow<T>(section: string, raw: string, status: RowStatus, issues: string[] = [], data: T | null = null, subtype?: string): ReviewedRow<T> {
  return { section, raw, status, issues, data, subtype };
}

function groupReviewedRows<T>(rows: ReviewedRow<T>[]) {
  return {
    ready: rows.filter((row) => row.status === "ready"),
    ignored_placeholder: rows.filter((row) => row.status === "ignored_placeholder"),
    rejected_header: rows.filter((row) => row.status === "rejected_header"),
    needs_review: rows.filter((row) => row.status === "needs_review"),
  };
}

function summarizeReviewedSection<T>(lines: string[], rows: ReviewedRow<T>[], headerPattern?: HeaderPattern): SectionSummary {
  const nonHeadingLines = lines.filter((line) => !looksLikeSectionHeading(line));
  const tableLines = nonHeadingLines.filter((line) => line.includes("|"));
  const detected = lines.length > 0;
  const headerDetected = headerPattern ? tableLines.some((line) => matchesHeaderPattern(line, headerPattern)) : false;
  const grouped = groupReviewedRows(rows);
  const meaningfulRows = grouped.ready.length + grouped.needs_review.length;
  return {
    detected,
    headerDetected,
    parsedCount: grouped.ready.length,
    empty: detected && tableLines.length > 0 && meaningfulRows === 0,
    skipped: !detected,
    skipReason: !detected ? "Section heading not found in extracted document order." : undefined,
    ready: grouped.ready.length,
    ignored_placeholder: grouped.ignored_placeholder.length,
    rejected_header: grouped.rejected_header.length,
    needs_review: grouped.needs_review.length,
  };
}

const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

function looksLikeYearOrRange(value: string | null | undefined) {
  if (!value) return false;
  const normalized = normalizeBrokenNumericTokens(value);
  const endpoint = `(?:${MONTH_RE}\\s*[-\\/\\s]\\s*)?(19|20)\\d{2}`;
  const rangeRe = new RegExp(`^${endpoint}\\s*(?:[-–—\\/]|to)\\s*(?:${endpoint}|present|current|now|date|to date)$`, "i");
  if (rangeRe.test(normalized)) return true;
  if (new RegExp(`^${endpoint}$`, "i").test(normalized)) return true;
  return /^(19|20)\d{2}$/.test(normalized)
    || /^(19|20)\d{2}\s*[-–—\/]\s*((19|20)\d{2}|present|current|now)$/i.test(normalized)
    || /^(spring|summer|fall|winter)\s+(19|20)\d{2}$/i.test(normalized)
    || /^(since\s+)?[A-Za-z]{3,12}\s+(19|20)\d{2}$/i.test(normalized);
}

function looksLikePeriod(value: string | null | undefined) {
  if (!value) return false;
  const normalized = normalizeBrokenNumericTokens(value);
  return looksLikeYearOrRange(normalized)
    || /^(19|20)\d{2}\s*(to|[-–—])\s*(present|current|now|(19|20)\d{2})$/i.test(normalized)
    || /^(present|current)$/i.test(normalized);
}

function looksLikeCitation(value: string | null | undefined) {
  if (!value) return false;
  return CITATION_RE.test(value) || ((value.match(/(19|20)\d{2}/g)?.length ?? 0) > 0 && /[\.;:,]/.test(value));
}

function looksLikeIcCategory(value: string | null | undefined) {
  if (!value) return false;
  return IC_CATEGORY_RE.test(value);
}

function hasMultiRecordPattern(value: string | null | undefined) {
  if (!value) return false;
  if (value.includes(" | ")) return true;
  return (value.match(/\((19|20)\d{2}\)/g)?.length ?? 0) > 1;
}

function looksLikeServiceLevel(value: string | null | undefined) {
  if (!value) return false;
  return SERVICE_LEVEL_RE.test(value);
}

function looksLikeQuartileOrRank(value: string | null | undefined) {
  if (!value) return false;
  return QUARTILE_RE.test(value) || /^scopus$/i.test(value);
}

function sectionize(lines: string[]) {
  const sections: Record<string, string[]> = {
    personal_info: [],
    qualifications: [],
    professional_experience: [],
    intellectual_contributions: [],
    professional_engagement: [],
    service: [],
    awards: [],
    unclassified: [],
  };
  let currentKey = "unclassified";

  for (const line of lines) {
    const match = MAIN_SECTION_MATCHERS.find(({ pattern }) => pattern.test(line));
    if (match) currentKey = match.key;
    sections[currentKey].push(line);
  }

  return sections;
}

function splitIcSections(lines: string[]) {
  const sections: Record<string, string[]> = {};
  let currentKey = "unknown";

  for (const line of lines) {
    const match = IC_SECTION_MATCHERS.find(({ pattern }) => pattern.test(line));
    if (match) {
      currentKey = match.key;
      if (!sections[currentKey]) sections[currentKey] = [];
    }
    if (!sections[currentKey]) sections[currentKey] = [];
    sections[currentKey].push(line);
  }

  return sections;
}

function extractProfile(lines: string[]) {
  const profile: Record<string, string | null> = {
    first_name: null,
    last_name: null,
    full_name: null,
    department: null,
    employee_id: null,
    campus: null,
    academic_rank: null,
    ft_pt_status: null,
    highest_degree: null,
    highest_degree_date: null,
    date_joining_aksob: null,
  };

  const labelMap: Record<string, keyof typeof profile> = {
    "first name": "first_name",
    "last name": "last_name",
    "department": "department",
    "id number": "employee_id",
    "employee id": "employee_id",
    "campus": "campus",
    "academic rank": "academic_rank",
    "status": "ft_pt_status",
    "highest degree earned": "highest_degree",
    "highest degree": "highest_degree",
    "date of the highest degree": "highest_degree_date",
    "date joining aksob": "date_joining_aksob",
  };

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const label = match[1].toLowerCase().trim();
    const value = cleanValue(match[2]);
    const key = labelMap[label];
    if (!key || !value) continue;
    profile[key] = value;
  }

  profile.full_name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
  return profile;
}

function shouldMergeWithPreviousRow(previousRow: string, continuation: string, expectedCells: number) {
  if (!previousRow.includes("|")) return false;
  const previousCells = parseCells(previousRow);
  if (previousCells.length !== expectedCells) return false;
  if (!continuation || continuation.includes("|") || looksLikeSectionHeading(continuation)) return false;
  const lastCell = cleanValue(previousCells[expectedCells - 1]);
  if (!lastCell) return false;
  if (/[.!?:)]$/.test(lastCell)) return false;
  return true;
}

function mergeContinuationLines(lines: string[], expectedCells: number) {
  const merged: string[] = [];

  for (const line of lines) {
    if (!merged.length) {
      merged.push(line);
      continue;
    }

    const cleaned = cleanValue(line);
    if (!cleaned) {
      merged.push(line);
      continue;
    }

    const previous = merged[merged.length - 1];
    if (shouldMergeWithPreviousRow(previous, cleaned, expectedCells)) {
      const previousCells = parseCells(previous);
      previousCells[expectedCells - 1] = `${previousCells[expectedCells - 1]} ${cleaned}`.replace(/\s+/g, " ").trim();
      merged[merged.length - 1] = previousCells.join(" | ");
      continue;
    }

    merged.push(line);
  }

  return merged;
}

function reviewStrictTableSection<T>(
  lines: string[],
  section: string,
  expectedCells: number,
  headerPattern: HeaderPattern,
  mapper: (cells: string[], raw: string) => ReviewedRow<T>,
) {
  const rows: ReviewedRow<T>[] = [];
  const nonHeadingLines = mergeContinuationLines(lines.filter((line) => !looksLikeSectionHeading(line)), expectedCells);

  for (const raw of nonHeadingLines) {
    const headerCandidate = stripParenthetical(raw);
    if (matchesHeaderPattern(raw, headerPattern) || matchesHeaderPattern(headerCandidate, headerPattern)) {
      rows.push(createRow<T>(section, raw, "rejected_header", ["Header row rejected."], null));
      continue;
    }

    if (!raw.includes("|")) {
      const cleaned = cleanValue(raw);
      if (!cleaned) {
        rows.push(createRow<T>(section, raw, "ignored_placeholder", ["Placeholder or empty row ignored."], null));
      } else {
        rows.push(createRow<T>(section, raw, "needs_review", ["Non-tabular content found inside a structured table section."], null));
      }
      continue;
    }

    const cells = parseCells(raw);
    const meaningfulCells = cells.map((cell) => cleanValue(cell)).filter(Boolean);
    if (meaningfulCells.length === 0) {
      rows.push(createRow<T>(section, raw, "ignored_placeholder", ["Placeholder row ignored."], null));
      continue;
    }

    if (cells.length !== expectedCells) {
      rows.push(createRow<T>(section, raw, "needs_review", [`Expected ${expectedCells} columns but found ${cells.length}.`], null));
      continue;
    }

    rows.push(mapper(cells, raw));
  }

  return rows;
}

function extractQualifications(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "Academic & Professional Qualifications",
    4,
    TABLE_HEADER_PATTERNS.qualifications,
    (cells, raw) => {
      const degree = cleanValue(cells[0]);
      const institution = cleanValue(cells[1]);
      const yearCell = cleanValue(cells[2]);
      const fieldArea = cleanValue(cells[3]);
      const issues: string[] = [];

      if (!degree && !institution) issues.push("Missing degree and institution.");
      if (yearCell && !looksLikeYearOrRange(yearCell)) issues.push("Year column is not numeric or date-like.");
      if ([degree, institution, fieldArea].some((value) => HEADER_BLOB_RE.test(value || ""))) issues.push("Header text leaked into data row.");

      if (issues.length > 0) return createRow("Academic & Professional Qualifications", raw, "needs_review", issues, null);

      return createRow("Academic & Professional Qualifications", raw, "ready", [], {
        degree_certification: degree,
        institution,
        year: normalizeYear(yearCell || "") ?? null,
        field_area: fieldArea,
        source_section: "Academic & Professional Qualifications",
      });
    },
  );
}

function extractAwards(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "Awards & Recognition",
    3,
    TABLE_HEADER_PATTERNS.awards,
    (cells, raw) => {
      const yearCell = cleanValue(cells[0]);
      const award = cleanValue(cells[1]);
      const institution = cleanValue(cells[2]);
      const issues: string[] = [];

      if (yearCell && !looksLikeYearOrRange(yearCell) && !/(19|20)\d{2}/.test(yearCell)) {
        issues.push("Year column is not numeric or date-like.");
      }
      if (!award) issues.push("Missing award name.");
      if ([award, institution].some((value) => HEADER_BLOB_RE.test(value || ""))) issues.push("Header text leaked into award row.");

      if (issues.length > 0) return createRow("Awards & Recognition", raw, "needs_review", issues, null);

      return createRow("Awards & Recognition", raw, "ready", [], {
        year: normalizeYear(yearCell || "") ?? null,
        award,
        institution_organization: institution,
        source_section: "Awards & Recognition",
      });
    },
  );
}

function extractEngagements(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "Professional Engagement Activities",
    3,
    TABLE_HEADER_PATTERNS.engagements,
    (cells, raw) => {
      const fromTo = cleanValue(cells[0]);
      const activity = cleanValue(cells[1]);
      const details = cleanValue(cells[2]);
      const issues: string[] = [];

      if (!activity && !details) issues.push("Missing activity and details.");
      const firstCellLooksLikePeriod = looksLikePeriod(fromTo) || /(19|20)\d{2}/.test(fromTo || "");
      if (!firstCellLooksLikePeriod && (looksLikeCitation(activity) || looksLikeCitation(details))) {
        issues.push("Row looks like an intellectual contribution, not an engagement.");
      }
      if (hasMultiRecordPattern(activity)) issues.push("Activity appears to contain concatenated multiple records.");

      if (issues.length > 0) return createRow("Professional Engagement Activities", raw, "needs_review", issues, null);

      return createRow("Professional Engagement Activities", raw, "ready", [], {
        from_to: fromTo,
        activity: activity || details,
        original_cv_item_type: activity,
        details,
        source_section: "Professional Engagement Activities",
      });
    },
  );
}

function extractServices(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "Service Contributions",
    3,
    TABLE_HEADER_PATTERNS.service,
    (cells, raw) => {
      const fromTo = cleanValue(cells[0]);
      const level = cleanValue(cells[1]);
      const committeeRole = cleanValue(cells[2]);
      const issues: string[] = [];

      if (level && !looksLikeServiceLevel(level)) issues.push("Level is not a recognized service scope.");
      if (!committeeRole) issues.push("Missing committee / role.");
      if (committeeRole && committeeRole.includes(" | ")) issues.push("Row appears to contain concatenated rows.");

      if (issues.length > 0) return createRow("Service Contributions", raw, "needs_review", issues, null);

      return createRow("Service Contributions", raw, "ready", [], {
        from_to: fromTo,
        original_cv_item_type: level,
        level,
        committee_role: committeeRole,
        source_section: "Service Contributions",
      });
    },
  );
}

function extractProfessionalExperience(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "Professional Experience",
    4,
    TABLE_HEADER_PATTERNS.professionalExperience,
    (cells, raw) => {
      const period = cleanValue(cells[0]);
      const organization = cleanValue(cells[1]);
      const positionTitle = cleanValue(cells[2]);
      const responsibilities = cleanValue(cells[3]);
      const issues: string[] = [];

      if (!organization && !positionTitle) issues.push("Missing organization and position.");
      if (hasMultiRecordPattern(responsibilities)) issues.push("Responsibilities appear to contain multiple merged rows.");

      if (issues.length > 0) return createRow("Professional Experience", raw, "needs_review", issues, null);

      return createRow("Professional Experience", raw, "ready", [], {
        period,
        organization,
        position_title: positionTitle,
        key_responsibilities: responsibilities,
        source_section: "Professional Experience",
      });
    },
  );
}

// ---- APA citation parsing layer ----
// Strict, conservative extractor. Leaves fields blank when confidence is low.
// Order: DOI -> Year -> Authors (before year) -> Title (first sentence after year) -> Journal (next sentence, stripped of vol/issue/pages)

const DOI_RE = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[^\s,;]+)/i;
const URL_RE = /https?:\/\/\S+/gi;

function parseApaCitation(citation: string): {
  authors: string | null;
  year: number | null;
  title: string | null;
  journal: string | null;
  doi: string | null;
} {
  const result = { authors: null as string | null, year: null as number | null, title: null as string | null, journal: null as string | null, doi: null as string | null };
  if (!citation) return result;

  let working = citation.replace(/\s+/g, " ").trim();

  // 1) DOI - prefer explicit doi.org URL, else bare 10.x/...
  const doiUrlMatch = working.match(/https?:\/\/(?:dx\.)?doi\.org\/\S+/i);
  if (doiUrlMatch) {
    result.doi = doiUrlMatch[0].replace(/[.,;)\]]+$/, "");
  } else {
    const bare = working.match(/\b10\.\d{4,9}\/[^\s,;]+/);
    if (bare) result.doi = bare[0].replace(/[.,;)\]]+$/, "");
  }

  // Strip DOI + any other URLs from working copy so they can't leak into journal
  let stripped = working;
  if (result.doi) stripped = stripped.split(result.doi).join(" ");
  stripped = stripped.replace(URL_RE, " ").replace(/\s+/g, " ").trim();

  // 2) Year inside (YYYY)
  const yearMatch = stripped.match(/\((19|20)\d{2}[a-z]?\)/i);
  if (yearMatch) {
    result.year = parseInt(yearMatch[0].replace(/[()a-z]/gi, ""), 10);
  }

  // 3) Authors = before (YYYY)
  if (yearMatch) {
    const authors = stripped.slice(0, stripped.indexOf(yearMatch[0])).trim().replace(/[.,;:\s]+$/, "");
    if (authors && authors.length <= 400) result.authors = authors;
  }

  // 4) After-year remainder → title + journal
  const afterYear = yearMatch
    ? stripped.slice(stripped.indexOf(yearMatch[0]) + yearMatch[0].length).replace(/^[\s.\-–—:]+/, "")
    : stripped;

  // Split into sentences by ". " - keep abbreviations safe enough for APA
  const sentences = afterYear.split(/\.\s+(?=[A-Z“"])/).map((s) => s.replace(/\.\s*$/, "").trim()).filter(Boolean);

  if (sentences.length > 0) {
    result.title = sentences[0].replace(/^["“]|["”]$/g, "").trim() || null;
  }

  if (sentences.length > 1) {
    // Journal = next sentence, but strip trailing volume/issue/pages like ", 53, 101978" or " 12(3), 100-120"
    let journal = sentences[1];
    // Cut at first comma followed by digits (volume marker) or "Vol." / "vol "
    journal = journal.split(/,\s*(?=\d)|\s+vol\.?\s+\d|\s+\d+\s*\(\d+\)/i)[0];
    journal = journal.replace(/[\s.,;:]+$/, "").trim();
    // Reject if it looks like a DOI/URL fragment or pure numbers
    if (journal && !/^https?:|^10\.\d/i.test(journal) && !/^\d+$/.test(journal) && journal.length <= 200) {
      result.journal = journal;
    }
  }

  return result;
}

function buildIcEntry(base: Record<string, unknown>) {
  const citation = String(base.raw_text || base.apa_citation || "").trim();
  const parsed = parseApaCitation(citation);

  const explicitTitle = typeof base.title === "string" ? base.title.trim() : "";
  const title = explicitTitle || parsed.title || citation;

  const quartile = typeof base.quartile === "string" ? base.quartile.toUpperCase() : null;
  const category = typeof base.ic_category === "string" && !isPlaceholder(base.ic_category) ? base.ic_category : null;
  const year = typeof base.year === "number" ? base.year : (parsed.year ?? normalizeYear(String(base.year || "")));

  // journal_outlet: explicit override (e.g., publisher cell for books) wins, else parsed journal.
  // Never accept a value that contains a DOI/URL pattern.
  const explicitJournal = typeof base.journal_outlet === "string" ? base.journal_outlet.trim() : "";
  let journal: string | null = explicitJournal || parsed.journal || null;
  if (journal && /https?:\/\/|10\.\d{4,9}\//i.test(journal)) journal = null;

  const doi = parsed.doi;
  const confidence = quartile && category && year ? "high" : year ? "medium" : "low";

  return {
    title,
    authors: parsed.authors,
    year: year ?? null,
    journal_outlet: journal,
    ic_type: base.ic_type || null,
    // Requirement 5: the classification written in the source CV, preserved verbatim.
    original_cv_item_type: (base.original_cv_item_type as string | null) || (base.ic_type as string | null) || null,

    ic_category: category,
    quartile,
    doi,
    apa_citation: citation || null,
    source_section: base.source_section || null,
    raw_text: citation || null,
    confidence,
  };
}

function extractPrjEntries(lines: string[]) {
  return reviewStrictTableSection(
    lines,
    "PRJs",
    3,
    TABLE_HEADER_PATTERNS.prj,
    (cells, raw) => {
      const citation = cleanValue(cells[0]);
      const scopusRank = cleanValue(cells[1]);
      const icCategory = cleanValue(cells[2]);
      const issues: string[] = [];

      if (!citation || !looksLikeCitation(citation)) issues.push("Citation is missing or does not look like a PRJ citation.");
      if (scopusRank && !looksLikeQuartileOrRank(scopusRank)) issues.push("Scopus rank is not recognized.");
      if (icCategory && !looksLikeIcCategory(icCategory)) issues.push("IC category is not recognized.");
      if (hasMultiRecordPattern(citation)) issues.push("Citation row appears to contain multiple merged records.");

      if (issues.length > 0) return createRow("PRJs", raw, "needs_review", issues, null, "PRJ");

      return createRow("PRJs", raw, "ready", [], buildIcEntry({
        raw_text: citation,
        quartile: scopusRank,
        ic_category: icCategory,
        ic_type: "PRJ",
        original_cv_item_type: "Peer-Reviewed Journals",
        source_section: "PRJs",
      }), "PRJ");
    },
  );
}

function extractBookLikeEntries(lines: string[], icType: string, sourceSection: string, originalType: string) {
  return reviewStrictTableSection(
    lines,
    sourceSection,
    3,
    TABLE_HEADER_PATTERNS.bookLike,
    (cells, raw) => {
      const citation = cleanValue(cells[0]);
      const publisher = cleanValue(cells[1]);
      const icCategory = cleanValue(cells[2]);
      const issues: string[] = [];

      if (!citation || !looksLikeCitation(citation)) issues.push("Citation is missing or malformed.");
      if (icCategory && !looksLikeIcCategory(icCategory)) issues.push("IC category is not recognized.");
      if (hasMultiRecordPattern(citation)) issues.push("Citation row appears to contain multiple merged records.");

      if (issues.length > 0) return createRow(sourceSection, raw, "needs_review", issues, null, icType);

      return createRow(sourceSection, raw, "ready", [], buildIcEntry({
        raw_text: citation,
        ic_type: icType,
        original_cv_item_type: originalType,
        ic_category: icCategory,
        source_section: sourceSection,
        journal_outlet: publisher,
      }), icType);
    },
  );
}

function extractOtherIcEntries(lines: string[], sourceSection: string) {
  return reviewStrictTableSection(
    lines,
    sourceSection,
    4,
    TABLE_HEADER_PATTERNS.otherIc,
    (cells, raw) => {
      const yearCell = cleanValue(cells[0]);
      const type = cleanValue(cells[1]);
      const icCategory = cleanValue(cells[2]);
      const details = cleanValue(cells[3]);
      const issues: string[] = [];

      if (yearCell && !looksLikeYearOrRange(yearCell) && !/(19|20)\d{2}/.test(yearCell)) {
        issues.push("Year column is not numeric or date-like.");
      }
      if (icCategory && !looksLikeIcCategory(icCategory)) issues.push("IC category is not recognized.");
      if (!details) issues.push("Missing details.");
      if (hasMultiRecordPattern(details)) issues.push("Details appear to contain multiple merged rows.");

      if (issues.length > 0) return createRow(sourceSection, raw, "needs_review", issues, null, "Other IC");

      return createRow(sourceSection, raw, "ready", [], buildIcEntry({
        title: details,
        raw_text: details,
        year: normalizeYear(yearCell || "") ?? null,
        ic_type: type,
        original_cv_item_type: type,
        ic_category: icCategory,
        source_section: sourceSection,
      }), "Other IC");
    },
  );
}

function extractIntellectualContributionReview(lines: string[]) {
  const sections = splitIcSections(lines);

  const prjs = sections.prjs ? extractPrjEntries(sections.prjs) : [];
  const books = sections.books ? extractBookLikeEntries(sections.books, "Book", "Books", "Books") : [];
  const chapters = sections.chapters ? extractBookLikeEntries(sections.chapters, "Chapter", "Chapters", "Chapters in Edited Books") : [];
  const otherIcs = sections.other_ics ? extractOtherIcEntries(sections.other_ics, "Other Intellectual Contributions") : [];
  const academicEngagement = sections.academic_engagement ? extractOtherIcEntries(sections.academic_engagement, "Academic Engagement Activities") : [];

  return { sections, prjs, books, chapters, otherIcs, academicEngagement };
}

export function parseCvText(cvText: string, enableAiParsing = false): ParseCvResponse {
  if (!cvText || typeof cvText !== "string") {
    return { ok: false, error: "cvText is required", diagnostics: { error_stage: "input_validation" } };
  }

  const lines = sanitizeText(cvText);
  const sections = sectionize(lines);
  const warnings: string[] = [];

  if (enableAiParsing) {
    warnings.push("AI parsing remains disabled in this strict AACSB mode; rule-based section parsing was used.");
  }

  const personalInfo = extractProfile(sections.personal_info);
  const qualificationReview = extractQualifications(sections.qualifications);
  const awardReview = extractAwards(sections.awards);
  const engagementReview = extractEngagements(sections.professional_engagement);
  const serviceReview = extractServices(sections.service);
  const professionalExperienceReview = extractProfessionalExperience(sections.professional_experience);
  const icReview = extractIntellectualContributionReview(sections.intellectual_contributions);

  const readyQualifications = qualificationReview.filter((row) => row.status === "ready" && row.data).map((row) => row.data);
  const readyAwards = awardReview.filter((row) => row.status === "ready" && row.data).map((row) => row.data);
  const readyEngagements = engagementReview.filter((row) => row.status === "ready" && row.data).map((row) => row.data);
  const readyServices = serviceReview.filter((row) => row.status === "ready" && row.data).map((row) => row.data);
  const readyProfessionalExperience = professionalExperienceReview.filter((row) => row.status === "ready" && row.data).map((row) => row.data);
  const readyIcs = [...icReview.prjs, ...icReview.books, ...icReview.chapters, ...icReview.otherIcs]
    .filter((row) => row.status === "ready" && row.data)
    .map((row) => row.data);
  // Requirement 8: Academic Engagement Activities are a separate section and must
  // never contribute to Intellectual Contribution totals.
  const readyAcademicEngagement = icReview.academicEngagement
    .filter((row) => row.status === "ready" && row.data)
    .map((row) => row.data);

  const reviewSections = {
    qualifications: groupReviewedRows(qualificationReview),
    awards: groupReviewedRows(awardReview),
    professional_engagement: groupReviewedRows(engagementReview),
    service: groupReviewedRows(serviceReview),
    professional_experience: groupReviewedRows(professionalExperienceReview),
    prjs: groupReviewedRows(icReview.prjs),
    books: groupReviewedRows(icReview.books),
    chapters: groupReviewedRows(icReview.chapters),
    other_ics: groupReviewedRows(icReview.otherIcs),
    academic_engagement: groupReviewedRows(icReview.academicEngagement),
  };

  const sectionSummary = {
    qualifications: summarizeReviewedSection(sections.qualifications, qualificationReview, TABLE_HEADER_PATTERNS.qualifications),
    awards: summarizeReviewedSection(sections.awards, awardReview, TABLE_HEADER_PATTERNS.awards),
    professional_experience: summarizeReviewedSection(sections.professional_experience, professionalExperienceReview, TABLE_HEADER_PATTERNS.professionalExperience),
    professional_engagement: summarizeReviewedSection(sections.professional_engagement, engagementReview, TABLE_HEADER_PATTERNS.engagements),
    service: summarizeReviewedSection(sections.service, serviceReview, TABLE_HEADER_PATTERNS.service),
    prjs: summarizeReviewedSection(icReview.sections.prjs || [], icReview.prjs, TABLE_HEADER_PATTERNS.prj),
    books: summarizeReviewedSection(icReview.sections.books || [], icReview.books, TABLE_HEADER_PATTERNS.bookLike),
    chapters: summarizeReviewedSection(icReview.sections.chapters || [], icReview.chapters, TABLE_HEADER_PATTERNS.bookLike),
    other_ics: summarizeReviewedSection(icReview.sections.other_ics || [], icReview.otherIcs, TABLE_HEADER_PATTERNS.otherIc),
    academic_engagement: summarizeReviewedSection(icReview.sections.academic_engagement || [], icReview.academicEngagement, TABLE_HEADER_PATTERNS.otherIc),
  };

  const totalNeedsReview = Object.values(sectionSummary).reduce((sum, section) => sum + (section.needs_review || 0), 0);
  const totalRejectedHeaders = Object.values(sectionSummary).reduce((sum, section) => sum + (section.rejected_header || 0), 0);
  const totalIgnored = Object.values(sectionSummary).reduce((sum, section) => sum + (section.ignored_placeholder || 0), 0);

  for (const [key, summary] of Object.entries(sectionSummary)) {
    if (summary.detected && summary.ready === 0 && summary.needs_review > 0) {
      warnings.push(`${key} was detected, but all rows were excluded by validation.`);
    }
  }

  if (totalNeedsReview > 0) {
    warnings.push(`${totalNeedsReview} row(s) need review and were excluded from database-ready output.`);
  }
  if (totalRejectedHeaders > 0) {
    warnings.push(`${totalRejectedHeaders} header row(s) were rejected and will not be saved.`);
  }
  if (totalIgnored > 0) {
    warnings.push(`${totalIgnored} placeholder row(s) were ignored.`);
  }
  if (!personalInfo.first_name || !personalInfo.last_name) {
    warnings.push("Faculty profile fields are incomplete and may need review.");
  }

  return {
    ok: true,
    data: {
      cv_type: /faculty cv\s*[–—-]\s*practitioner|practitioner/i.test(cvText) ? "practitioner" : "academic",
      personal_info: personalInfo,
      qualifications: readyQualifications,
      intellectual_contributions: readyIcs,
      engagements: readyEngagements,
      services: readyServices,
      awards: readyAwards,
      professional_experience: readyProfessionalExperience,
      academic_engagement: readyAcademicEngagement,
    },
    warnings,
    diagnostics: {
      sections_detected: Object.entries(sectionSummary).filter(([, value]) => value.detected || value.headerDetected).map(([key]) => key),
      sections_empty: Object.entries(sectionSummary).filter(([, value]) => value.empty).map(([key]) => key),
      sections_parsed: Object.entries(sectionSummary).filter(([, value]) => value.parsedCount > 0).map(([key]) => key),
      sections_skipped: Object.entries(sectionSummary).filter(([, value]) => value.skipped).map(([key, value]) => ({ key, reason: value.skipReason })),
      section_summary: sectionSummary,
      review_sections: reviewSections,
      validation_summary: {
        ready: Object.values(sectionSummary).reduce((sum, section) => sum + (section.ready || 0), 0),
        needs_review: totalNeedsReview,
        rejected_header: totalRejectedHeaders,
        ignored_placeholder: totalIgnored,
      },
      text_length: cvText.length,
      ic_count: readyIcs.length,
    },
  };
}
