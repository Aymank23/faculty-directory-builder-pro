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
  "documentation is needed for every item listed",
];

// Narrative section headers / parser noise that historically polluted real
// data fields (e.g. "(Since Fall 2020 – listed from most recent to last)").
// Lines matching these patterns are dropped during sanitization.
const NOISE_PATTERNS: RegExp[] = [
  /listed\s+from\s+most\s+recent/i,
  /most\s+recent\s+to\s+last/i,
  /^[\(\[].*listed.*[\)\]]$/i,
];

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

const MAIN_SECTION_MATCHERS: Array<{ key: string; pattern: RegExp }> = [
  { key: "personal_info", pattern: /^#*\s*1\.?\s*personal/i },
  // Tolerant of duplicated/extra words (e.g. "2. Academic  Academic & Professional Qualifications")
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlaceholder(value: unknown) {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase().trim();
  return PLACEHOLDERS.some((placeholder) => normalized.includes(placeholder));
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

function sanitizeText(cvText: string) {
  return cvText
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanLine)
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

function looksLikePeriod(line: string) {
  return /^(\d{4}|[A-Za-z]{3,9}-\d{4}|[A-Za-z]{3,9}\s+\d{4}|\d{4}\s*(to|\-|–|—)\s*(present|date|\d{4})|\d{4}\s*present|\d{4}-present|\d{4}-\d{4}|\d{4}\s*to\s*present)/i.test(line);
}

function looksLikeQuartile(line: string) {
  return /^(Q[1-4]|NA|N\/A)$/i.test(line.trim());
}

function looksLikeScholarship(line: string) {
  return /(scholarship|teaching|learning|integration|discovery|applied|basic)/i.test(line);
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
    const value = match[2].trim();
    const key = labelMap[label];
    if (!key || isPlaceholder(value)) continue;
    profile[key] = value;
  }

  profile.full_name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
  return profile;
}

// Detect whether a string represents a degree/certification (heuristic).
const DEGREE_TOKENS_RE = /\b(ph\.?d|m\.?b\.?a|m\.?sc|m\.?a|b\.?sc|b\.?a|b\.?b\.?a|d\.?b\.?a|ed\.?d|j\.?d|llb|llm|diploma|certificate|certification|cert|fellow|cpa|cma|cfa|cia|cisa|frm|acca|aca|dipifr|pmp|bachelor|master|doctorate)\b/i;

function looksLikeDegreeToken(line: string) {
  return !!line && DEGREE_TOKENS_RE.test(line);
}

function extractQualifications(lines: string[]) {
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !/^(degree|institution|year|field\s*\/\s*area)$/i.test(line));
  const qualifications: Array<Record<string, string | number | null>> = [];

  // Iterate in 4-cell blocks but use CONTENT-BASED assignment so that a
  // missing/shifted cell in the source CV does not push the year into the
  // field/area column or vice-versa.
  for (let i = 0; i + 3 < content.length; i += 4) {
    const block = [content[i], content[i + 1], content[i + 2], content[i + 3]]
      .map((c) => (c == null ? "" : c))
      .filter((c) => !isPlaceholder(c));
    if (block.length < 2) continue;

    // 1. Pull the year out of the block, wherever it lives.
    let year: number | null = null;
    const nonYear: string[] = [];
    for (const cell of block) {
      const y = !year ? normalizeYear(cell) : null;
      if (y && String(cell).trim().length <= 6) {
        year = y;
      } else {
        nonYear.push(cell);
      }
    }

    // 2. Identify the degree/certification by token; fall back to first cell.
    const degreeIdx = nonYear.findIndex(looksLikeDegreeToken);
    const degree = degreeIdx >= 0 ? nonYear[degreeIdx] : nonYear[0];
    const others = degreeIdx >= 0 ? nonYear.filter((_, idx) => idx !== degreeIdx) : nonYear.slice(1);
    const institution = others[0] ?? null;
    const field = others[1] ?? null;

    if (!degree) continue;

    qualifications.push({
      degree_certification: degree,
      institution,
      year,
      field_area: field,
      source_section: "Academic & Professional Qualifications",
    });
  }

  return qualifications;
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
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !/^(citation|scopus rank|ic category)/i.test(line));
  const entries: any[] = [];

  for (let i = 0; i < content.length; i++) {
    const citation = content[i];
    const quartile = content[i + 1];
    const category = content[i + 2];
    if (!citation || looksLikeQuartile(citation) || looksLikeScholarship(citation)) continue;
    if (!normalizeYear(citation) && !/doi|journal|review|management|education|analysis|ethics|vaccines|methodology|performance|studies/i.test(citation)) continue;

    entries.push(buildIcEntry({
      raw_text: citation,
      quartile: looksLikeQuartile(quartile || "") ? quartile : null,
      ic_category: looksLikeScholarship(category || "") ? category : null,
      ic_type: "PRJ",
      source_section: "PRJs",
    }));

    if (looksLikeQuartile(quartile || "")) i += 1;
    if (looksLikeScholarship(category || "")) i += 1;
  }

  return entries;
}

function extractBookLikeEntries(lines: string[], icType: string, sourceSection: string) {
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !/^(citation|publisher name|ic category)/i.test(line));
  const entries: any[] = [];
  for (let i = 0; i + 2 < content.length; i += 3) {
    const citation = content[i];
    const category = content[i + 2];
    if (!citation || isPlaceholder(citation)) continue;
    entries.push(buildIcEntry({
      raw_text: citation,
      ic_type: icType,
      ic_category: looksLikeScholarship(category) ? category : null,
      source_section: sourceSection,
    }));
  }
  return entries;
}

function extractYearGroupedIcEntries(lines: string[], defaultType: string, sourceSection: string) {
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !/^(year|type of contributions|category|details)$/i.test(line));
  const entries: any[] = [];

  for (let i = 0; i < content.length; ) {
    const yearLine = content[i];
    if (!yearLine || isPlaceholder(yearLine) || !normalizeYear(yearLine)) {
      i += 1;
      continue;
    }

    const typeLine = content[i + 1] || defaultType;
    const categoryLine = content[i + 2] || null;
    let detailIndex = i + 3;
    const detailParts: string[] = [];
    while (detailIndex < content.length && !normalizeYear(content[detailIndex])) {
      if (!looksLikeSectionHeading(content[detailIndex])) detailParts.push(content[detailIndex]);
      detailIndex += 1;
    }

    const detail = detailParts.join(" ").trim();
    entries.push(buildIcEntry({
      raw_text: detail || `${typeLine} ${yearLine}`,
      year: normalizeYear(yearLine),
      ic_type: isPlaceholder(typeLine) ? defaultType : typeLine,
      ic_category: categoryLine,
      source_section: sourceSection,
      title: detail || typeLine,
    }));

    i = Math.max(detailIndex, i + 4);
  }

  return entries;
}

// Valid IC types (PRJ, Book, Chapter only). Academic engagement activities, conference proceedings,
// editorial roles etc. must NOT be in intellectual_contributions — they belong in
// professional_engagements / service_contributions.
const VALID_IC_TYPES = new Set(["PRJ", "Book", "Chapter"]);

function extractIntellectualContributions(lines: string[]) {
  const sections = splitIcSections(lines);
  return [
    ...(sections.prjs ? extractPrjEntries(sections.prjs) : []),
    ...(sections.books ? extractBookLikeEntries(sections.books, "Book", "Books") : []),
    ...(sections.chapters ? extractBookLikeEntries(sections.chapters, "Chapter", "Chapters") : []),
  ].filter((entry) => entry.title && !isPlaceholder(entry.title) && VALID_IC_TYPES.has(String(entry.ic_type)));
}

// Extract academic engagements (year-grouped IC sections that are really engagement entries)
function extractEngagementsFromIcSection(lines: string[]) {
  const sections = splitIcSections(lines);
  const engagementRows: any[] = [];
  if (sections.other_ics) {
    extractYearGroupedIcEntries(sections.other_ics, "Other IC", "Other ICs").forEach((e) => {
      engagementRows.push({
        from_to: e.year ? String(e.year) : null,
        activity: e.title || e.ic_type || "Other intellectual contribution",
        details: e.apa_citation || e.raw_text || null,
        engagement_type: e.ic_type || "Other IC",
        year: e.year || null,
        source_section: "Other ICs (reclassified from CV)",
      });
    });
  }
  if (sections.academic_engagement) {
    extractYearGroupedIcEntries(sections.academic_engagement, "Academic Engagement", "Academic Engagement Activities").forEach((e) => {
      engagementRows.push({
        from_to: e.year ? String(e.year) : null,
        activity: e.title || e.ic_type || "Academic engagement",
        details: e.apa_citation || e.raw_text || null,
        engagement_type: e.ic_type || "Academic Engagement",
        year: e.year || null,
        source_section: "Academic Engagement Activities",
      });
    });
  }
  return engagementRows;
}

function extractTripleRows(lines: string[], headers: RegExp[], fieldNames: [string, string, string], sourceSection: string) {
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !headers.some((header) => header.test(line)));
  const rows: any[] = [];
  for (let i = 0; i + 2 < content.length; i += 3) {
    const first = content[i];
    const second = content[i + 1];
    const third = content[i + 2];
    if (isPlaceholder(second) || isPlaceholder(third)) continue;
    rows.push({
      [fieldNames[0]]: first,
      [fieldNames[1]]: second,
      [fieldNames[2]]: third,
      source_section: sourceSection,
    });
  }
  return rows;
}

function extractProfessionalExperience(lines: string[]) {
  const content = lines.filter((line) => !looksLikeSectionHeading(line) && !/^(period|organization\/ employer|position\/title|key responsibilities relevant to teaching)/i.test(line));
  const rows: any[] = [];

  for (let i = 0; i < content.length; ) {
    const period = content[i];
    if (!period || !looksLikePeriod(period)) {
      i += 1;
      continue;
    }
    const organization = content[i + 1];
    const position = content[i + 2];
    let detailIndex = i + 3;
    const details: string[] = [];
    while (detailIndex < content.length && !looksLikePeriod(content[detailIndex])) {
      if (!looksLikeSectionHeading(content[detailIndex])) details.push(content[detailIndex]);
      detailIndex += 1;
    }
    if (organization && !isPlaceholder(organization)) {
      rows.push({
        period,
        organization,
        position_title: isPlaceholder(position) ? null : position,
        key_responsibilities: details.join(" ").trim() || null,
        source_section: "Professional Experience",
      });
    }
    i = Math.max(detailIndex, i + 4);
  }

  return rows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvText, enableAiParsing = false } = await req.json();
    if (!cvText || typeof cvText !== "string") {
      return json({ ok: false, error: "cvText is required", diagnostics: { error_stage: "input_validation" } }, 400);
    }

    const lines = sanitizeText(cvText);
    const sections = sectionize(lines);
    const warnings: string[] = [];

    if (enableAiParsing) {
      warnings.push("AI parsing is optional and non-blocking; rule-based AACSB parsing was used.");
    }

    const personalInfo = extractProfile(sections.personal_info);
    const qualifications = extractQualifications(sections.qualifications);
    const intellectualContributions = extractIntellectualContributions(sections.intellectual_contributions);
    const professionalExperience = extractProfessionalExperience(sections.professional_experience);
    const reclassifiedEngagements = extractEngagementsFromIcSection(sections.intellectual_contributions);
    const baseEngagements = extractTripleRows(
      sections.professional_engagement,
      [/^from-to$/i, /^activity$/i, /^details$/i],
      ["from_to", "activity", "details"],
      "Professional Engagement Activities",
    );
    const engagements = [...baseEngagements, ...reclassifiedEngagements];
    const services = extractTripleRows(
      sections.service,
      [/^from-to$/i, /^level$/i, /^committee\s*\/\s*role$/i],
      ["from_to", "level", "committee_role"],
      "Service Contributions",
    );
    const awards = extractTripleRows(
      sections.awards,
      [/^year$/i, /^award\s*\/\s*recognition$/i, /^institution\s*\/\s*organization$/i],
      ["year", "award", "institution_organization"],
      "Awards & Recognition",
    ).map((award) => ({
      ...award,
      year: normalizeYear(String(award.year || "")) ?? award.year,
    }));

    if (!intellectualContributions.length) warnings.push("No intellectual contributions were confidently extracted; please review the raw text.");
    if (!qualifications.length) warnings.push("Qualifications table could not be fully mapped; please review before saving.");
    if (!personalInfo.first_name || !personalInfo.last_name) warnings.push("Faculty profile fields are incomplete and may need review.");

    return json({
      ok: true,
      data: {
        cv_type: /practitioner/i.test(cvText) ? "practitioner" : "academic",
        personal_info: personalInfo,
        qualifications,
        intellectual_contributions: intellectualContributions,
        engagements,
        services,
        awards,
        professional_experience: professionalExperience,
      },
      warnings,
      diagnostics: {
        sections_detected: Object.entries(sections).filter(([, value]) => value.length > 0).map(([key]) => key),
        text_length: cvText.length,
        ic_count: intellectualContributions.length,
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
