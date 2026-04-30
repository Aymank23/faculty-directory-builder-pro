import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLACEHOLDERS = [
  "click or tap here to enter text",
  "click or tap here",
  "choose an item",
  "enter year",
  "enter year.",
  "enter text",
  "click or tap to enter a date",
  "click or tap here to enter a date",
  "documentation is needed for every item listed",
  "n/a",
  "na",
  "none",
  "null",
];

const NOISE_PATTERNS: RegExp[] = [
  /listed\s+from\s+most\s+recent/i,
  /most\s+recent\s+to\s+last/i,
  /^[\(\[].*listed.*[\)\]]$/i,
  /^[—\-–\s]+$/,
];

const MAIN_SECTION_MATCHERS: Array<{ key: string; pattern: RegExp }> = [
  { key: "personal_info", pattern: /^#*\s*1\.?\s*personal/i },
  { key: "qualifications", pattern: /^#*\s*2\.?\s*[\w\s&./-]*?\bprofessional\s+qualifications\b/i },
  { key: "professional_experience", pattern: /^#*\s*3\.?\s*professional experience/i },
  { key: "intellectual_contributions", pattern: /intellectual contributions/i },
  { key: "professional_engagement", pattern: /professional engagement activities/i },
  { key: "service", pattern: /service contributions/i },
  { key: "awards", pattern: /awards\s*&?\s*recognition/i },
];

const IC_SECTION_MATCHERS: Array<{ key: string; label: string; pattern: RegExp; icType?: string }> = [
  { key: "prjs", label: "PRJs", pattern: /peer-?reviewed journal articles|\bprjs?\b/i, icType: "PRJ" },
  { key: "books", label: "Books", pattern: /^#*\s*(3|4)\.?\s*2\.?\s*books?/i, icType: "Book" },
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
  qualifications: /^degree(?:\s*\/\s*certification)?\s*\|\s*institution\s*\|\s*(?:date\s*\/\s*year|year)\s*\|\s*field\s*\/\s*area$/i,
  awards: /^year\s*\|\s*award\s*\/\s*recognition\s*\|\s*institution\s*\/\s*organization$/i,
  engagements: /^from-?to\s*\|\s*activity\s*\|\s*details$/i,
  service: /^from-?to\s*\|\s*level\s*\|\s*committee\s*\/\s*role$/i,
  professionalExperience: /^period\s*\|\s*organization\s*\/?\s*employer\s*\|\s*position\s*\/?\s*title\s*\|\s*key responsibilities/i,
  prj: /^citation\s*\|\s*scopus rank\s*\|\s*ic category$/i,
  bookLike: /^citation\s*\|\s*(?:publisher(?:\s+name)?|scopus rank)\s*\|\s*ic category$/i,
  otherIc: /^year\s*\|\s*(?:type(?:\s+of\s+contributions?)?|type)\s*\|\s*category\s*\|\s*details$/i,
};

type RowStatus = "ready" | "ignored_placeholder" | "rejected_header" | "needs_review";

type ReviewedRow<T = Record<string, unknown>> = {
  raw: string;
  status: RowStatus;
  issues: string[];
  data: T | null;
  section: string;
  subtype?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanLine(line: string) {
  return line
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholder(value: unknown) {
  if (value == null || value === "") return true;
  const normalized = String(value).toLowerCase().trim();
  return PLACEHOLDERS.some((placeholder) => normalized.includes(placeholder));
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
  // Strip parenthetical narrative noise (e.g. "(Listed from most recent to last)")
  // but PRESERVE the rest of the line so headings remain intact.
  let out = line;
  // Remove parenthetical chunks that contain noise phrases.
  out = out.replace(/\s*\([^)]*(?:listed\s+from\s+most\s+recent|most\s+recent\s+to\s+last|since\s+fall\s+\d{4}[^)]*listed[^)]*)[^)]*\)\s*/gi, " ");
  return out.replace(/\s+/g, " ").trim();
}

function sanitizeText(cvText: string) {
  return cvText
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanLine)
    .map((line) => {
      // If a line contains noise inline AND looks like a heading or contains other content, strip the noise rather than drop the line.
      if (line && isNoiseLine(line) && (looksLikeSectionHeading(line) || /^#+\s/.test(line) || /\b(qualifications|awards|service|engagement|contributions|professional|recognition)\b/i.test(line))) {
        return stripInlineNoise(line);
      }
      return line;
    })
    .filter((line) => {
      if (!line) return false;
      if (isPlaceholder(line)) return false;
      if (isNoiseLine(line)) return false;
      if (/^w:[a-z]/i.test(line)) return false;
      if (/^[<>/\\]+$/.test(line)) return false;
      return true;
    });
}

function normalizeYear(value?: string | null) {
  if (!value) return undefined;
  const match = value.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function looksLikeSectionHeading(line: string) {
  return MAIN_SECTION_MATCHERS.some(({ pattern }) => pattern.test(line)) ||
    IC_SECTION_MATCHERS.some(({ pattern }) => pattern.test(line));
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

function summarizeReviewedSection<T>(lines: string[], rows: ReviewedRow<T>[], headerPattern?: RegExp) {
  const nonHeadingLines = lines.filter((line) => !looksLikeSectionHeading(line));
  const tableLines = nonHeadingLines.filter((line) => line.includes("|"));
  const detected = lines.length > 0;
  const headerDetected = headerPattern ? tableLines.some((line) => headerPattern.test(line)) : false;
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

function looksLikeYearOrRange(value: string | null | undefined) {
  if (!value) return false;
  return /^(19|20)\d{2}$/.test(value)
    || /^(19|20)\d{2}\s*[-–—\/]\s*((19|20)\d{2}|present|current|now)$/i.test(value)
    || /^(spring|summer|fall|winter)\s+(19|20)\d{2}$/i.test(value)
    || /^(since\s+)?[A-Za-z]{3,12}\s+(19|20)\d{2}$/i.test(value);
}

function looksLikePeriod(value: string | null | undefined) {
  if (!value) return false;
  return looksLikeYearOrRange(value)
    || /^(19|20)\d{2}\s*(to|[-–—])\s*(present|current|now|(19|20)\d{2})$/i.test(value)
    || /^(present|current)$/i.test(value);
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

function reviewStrictTableSection<T>(
  lines: string[],
  section: string,
  expectedCells: number,
  headerPattern: RegExp,
  mapper: (cells: string[], raw: string) => ReviewedRow<T>,
) {
  const rows: ReviewedRow<T>[] = [];
  const nonHeadingLines = lines.filter((line) => !looksLikeSectionHeading(line));

  for (const raw of nonHeadingLines) {
    if (headerPattern.test(raw)) {
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

      if (yearCell && !looksLikeYearOrRange(yearCell)) issues.push("Year column is not numeric or date-like.");
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

      if (fromTo && !looksLikePeriod(fromTo)) issues.push("From-To column is not period-like.");
      if (!activity) issues.push("Missing activity.");
      if (looksLikeCitation(activity) || looksLikeCitation(details)) issues.push("Row looks like an intellectual contribution, not an engagement.");
      if (hasMultiRecordPattern(activity) || hasMultiRecordPattern(details)) issues.push("Row appears to contain concatenated multiple records.");

      if (issues.length > 0) return createRow("Professional Engagement Activities", raw, "needs_review", issues, null);

      return createRow("Professional Engagement Activities", raw, "ready", [], {
        from_to: fromTo,
        activity,
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

      if (fromTo && !looksLikePeriod(fromTo)) issues.push("From-To column is not period-like.");
      if (level && !looksLikeServiceLevel(level)) issues.push("Level is not a recognized service scope.");
      if (!committeeRole) issues.push("Missing committee / role.");
      if (looksLikeCitation(committeeRole) || hasMultiRecordPattern(committeeRole)) issues.push("Row appears to contain mixed or concatenated content.");

      if (issues.length > 0) return createRow("Service Contributions", raw, "needs_review", issues, null);

      return createRow("Service Contributions", raw, "ready", [], {
        from_to: fromTo,
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

      if (period && !looksLikePeriod(period)) issues.push("Period column is not date-like.");
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

function extractTitleFromCitation(citation: string) {
  const trimmed = citation.trim();
  const quoted = trimmed.match(/[“\"]([^”\"]+)[”\"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const withoutAuthors = trimmed.replace(/^.*?\((19|20)\d{2}\)\.\s*/, "");
  const parts = withoutAuthors.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  return (parts[0] || trimmed).replace(/^[-–—]+/, "").trim();
}

function extractJournalFromCitation(citation: string, title: string) {
  const normalized = citation.replace(title, " ").replace(/https?:\/\/doi\.org\/\S+/i, " ");
  const afterYear = normalized.replace(/^.*?\((19|20)\d{2}\)\.\s*/, "");
  const parts = afterYear.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : undefined;
}

function buildIcEntry(base: Record<string, unknown>) {
  const citation = String(base.raw_text || base.apa_citation || "").trim();
  const title = String(base.title || extractTitleFromCitation(citation));
  const quartile = typeof base.quartile === "string" ? base.quartile.toUpperCase() : null;
  const category = typeof base.ic_category === "string" && !isPlaceholder(base.ic_category) ? base.ic_category : null;
  const year = typeof base.year === "number" ? base.year : normalizeYear(citation) ?? normalizeYear(String(base.year || ""));
  const doi = citation.match(/https?:\/\/doi\.org\/\S+|10\.\d{4,9}\/[\w.\-;()/:]+/i)?.[0] || null;
  const confidence = quartile && category && year ? "high" : year ? "medium" : "low";

  return {
    title,
    authors: citation.includes(title) ? citation.split(title)[0].replace(/["“”]/g, "").trim().replace(/[.,;:]$/, "") : null,
    year: year ?? null,
    journal_outlet: extractJournalFromCitation(citation, title) || null,
    ic_type: base.ic_type || null,
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
        source_section: "PRJs",
      }), "PRJ");
    },
  );
}

function extractBookLikeEntries(lines: string[], icType: string, sourceSection: string) {
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

      if (yearCell && !looksLikeYearOrRange(yearCell)) issues.push("Year column is not numeric or date-like.");
      if (!type) issues.push("Missing contribution type.");
      if (icCategory && !looksLikeIcCategory(icCategory)) issues.push("IC category is not recognized.");
      if (!details) issues.push("Missing details.");
      if (hasMultiRecordPattern(details)) issues.push("Details appear to contain multiple merged rows.");

      if (issues.length > 0) return createRow(sourceSection, raw, "needs_review", issues, null, "Other IC");

      return createRow(sourceSection, raw, "ready", [], {
        year: normalizeYear(yearCell || "") ?? null,
        type,
        ic_category: icCategory,
        details,
        source_section: sourceSection,
      }, "Other IC");
    },
  );
}

function extractIntellectualContributionReview(lines: string[]) {
  const sections = splitIcSections(lines);

  const prjs = sections.prjs ? extractPrjEntries(sections.prjs) : [];
  const books = sections.books ? extractBookLikeEntries(sections.books, "Book", "Books") : [];
  const chapters = sections.chapters ? extractBookLikeEntries(sections.chapters, "Chapter", "Chapters") : [];
  const otherIcs = sections.other_ics ? extractOtherIcEntries(sections.other_ics, "Other Intellectual Contributions") : [];
  const academicEngagement = sections.academic_engagement ? extractOtherIcEntries(sections.academic_engagement, "Academic Engagement Activities") : [];

  return { sections, prjs, books, chapters, otherIcs, academicEngagement };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvText, enableAiParsing = false } = await req.json();
    if (!cvText || typeof cvText !== "string") {
      return json({ ok: false, error: "cvText is required", diagnostics: { error_stage: "input_validation" } }, 400);
    }

    const lines = sanitizeText(cvText);
    console.log("DEBUG: sanitized lines (first 50):", JSON.stringify(lines.slice(0, 50)));
    const sections = sectionize(lines);
    console.log("DEBUG: section sizes:", Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])));
    console.log("DEBUG: qualifications lines:", JSON.stringify(sections.qualifications));
    console.log("DEBUG: personal_info lines:", JSON.stringify(sections.personal_info));
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
    const readyIcs = [...icReview.prjs, ...icReview.books, ...icReview.chapters]
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

    if (!readyQualifications.length && sectionSummary.qualifications.detected) {
      warnings.push("Qualifications were detected structurally, but no valid qualification rows passed validation.");
    }
    if (!readyAwards.length && sectionSummary.awards.detected) {
      warnings.push("Awards were detected structurally, but no valid award rows passed validation.");
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

    return json({
      ok: true,
      data: {
        cv_type: /practitioner/i.test(cvText) ? "practitioner" : "academic",
        personal_info: personalInfo,
        qualifications: readyQualifications,
        intellectual_contributions: readyIcs,
        engagements: readyEngagements,
        services: readyServices,
        awards: readyAwards,
        professional_experience: readyProfessionalExperience,
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
    });
  } catch (e) {
    console.error("parse-cv error:", e);
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      fallback: true,
      diagnostics: { error_stage: "parse_cv_catch" },
    });
  }
});
