import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLACEHOLDERS = [
  "click or tap here to enter text",
  "choose an item",
  "enter year",
  "enter year.",
  "enter text",
  "click or tap to enter a date",
  "click or tap here",
];

const sectionMatchers: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "personal_info", label: "1 Personal & Academic Information", pattern: /^#*\s*1\.?\s*personal/i },
  { key: "qualifications", label: "2 Academic & Professional Qualifications", pattern: /^#*\s*2\.?\s*academic/i },
  { key: "professional_experience", label: "3 Professional Experience", pattern: /^#*\s*3\.?\s*professional experience/i },
  { key: "prjs", label: "PRJs", pattern: /peer-?reviewed journal articles|\bprjs?\b/i },
  { key: "books", label: "Books", pattern: /^#*\s*(3|4)\s*\.?\s*2\.?\s*books?/i },
  { key: "chapters", label: "Chapters", pattern: /chapters? in edited books/i },
  { key: "other_ics", label: "Other ICs", pattern: /other intellectual contributions|other ics/i },
  { key: "academic_engagement", label: "Academic Engagement Activities", pattern: /academic engagement activities/i },
  { key: "professional_engagement", label: "Professional Engagement Activities", pattern: /professional engagement activities|consulting services/i },
  { key: "service", label: "Service Contributions", pattern: /service contributions/i },
  { key: "awards", label: "Awards & Recognition", pattern: /awards?\s*&?\s*recognition/i },
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
  return PLACEHOLDERS.includes(value.toLowerCase().trim());
}

function sanitizeText(cvText: string) {
  return cvText
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isPlaceholder(line));
}

function sectionize(cvText: string) {
  const lines = sanitizeText(cvText);
  const sections: Record<string, string[]> = { unclassified: [] };
  let currentKey = "unclassified";

  for (const line of lines) {
    const match = sectionMatchers.find(({ pattern }) => pattern.test(line));
    if (match) {
      currentKey = match.key;
      if (!sections[currentKey]) sections[currentKey] = [];
    }
    if (!sections[currentKey]) sections[currentKey] = [];
    sections[currentKey].push(line);
  }

  const condensed: Record<string, string> = {};
  for (const [key, value] of Object.entries(sections)) {
    condensed[key] = value.join("\n").slice(0, 22000);
  }
  return condensed;
}

function filterPlaceholderRows(arr: any[], requiredFields: string[]) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((row) => requiredFields.some((field) => row[field] && !isPlaceholder(row[field])))
    .map((row) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) cleaned[k] = isPlaceholder(v) ? null : v;
      return cleaned;
    });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvText } = await req.json();
    if (!cvText || typeof cvText !== "string") {
      return json({ ok: false, error: "cvText is required", diagnostics: { error_stage: "input_validation" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ ok: false, error: "LOVABLE_API_KEY not configured", diagnostics: { error_stage: "config" } });
    }

    const sections = sectionize(cvText);
    const systemPrompt = `You are an expert parser for AACSB faculty CVs from AKSOB at LAU.

You will receive a faculty CV already split into sections. You must extract ALL structured data from ALL sections, section by section.

Rules:
- Never skip sections when content exists.
- Ignore template placeholders like "Click or tap here to enter text" and "Choose an item".
- Preserve table row alignment.
- For academic CVs: Section 3 = ICs, Section 4 = Professional Engagement, Section 5 = Service, Section 6 = Awards.
- For practitioner CVs: Section 3 = Professional Experience, Section 4 = ICs/Academic Engagement, Section 5 = Professional Engagement.
- IC type mapping: PRJs -> PRJ, Books -> Book, Chapters -> Chapter, academic engagement may map to Teaching & Learning / Other as appropriate.
- Always include source_section and confidence.
- If a section is weak or ambiguous, still return the extracted rows and lower confidence instead of dropping them.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Parse this AACSB CV and extract everything as structured data.\n\n${JSON.stringify(sections)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_cv_data",
              description: "Extract ALL structured AACSB CV sections from faculty CV text",
              parameters: {
                type: "object",
                properties: {
                  cv_type: { type: "string" },
                  personal_info: {
                    type: "object",
                    properties: {
                      first_name: { type: "string" },
                      last_name: { type: "string" },
                      department: { type: "string" },
                      campus: { type: "string" },
                      academic_rank: { type: "string" },
                      employee_id: { type: "string" },
                      ft_pt_status: { type: "string" },
                      highest_degree: { type: "string" },
                      highest_degree_date: { type: "string" },
                      date_joining_aksob: { type: "string" },
                    },
                    additionalProperties: false,
                  },
                  qualifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        degree_certification: { type: "string" },
                        institution: { type: "string" },
                        year: { type: "string" },
                        field_area: { type: "string" },
                        source_section: { type: "string" },
                      },
                      required: ["degree_certification"],
                      additionalProperties: false,
                    },
                  },
                  intellectual_contributions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        authors: { type: "string" },
                        year: { type: "number" },
                        journal_outlet: { type: "string" },
                        ic_type: { type: "string" },
                        ic_category: { type: "string" },
                        quartile: { type: "string" },
                        doi: { type: "string" },
                        apa_citation: { type: "string" },
                        source_section: { type: "string" },
                        raw_text: { type: "string" },
                        confidence: { type: "string" },
                      },
                      required: ["title", "confidence", "source_section"],
                      additionalProperties: false,
                    },
                  },
                  professional_experience: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        period: { type: "string" },
                        organization: { type: "string" },
                        position_title: { type: "string" },
                        key_responsibilities: { type: "string" },
                        source_section: { type: "string" },
                      },
                      required: ["organization"],
                      additionalProperties: false,
                    },
                  },
                  engagements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        from_to: { type: "string" },
                        activity: { type: "string" },
                        details: { type: "string" },
                        source_section: { type: "string" },
                      },
                      required: ["activity"],
                      additionalProperties: false,
                    },
                  },
                  services: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        from_to: { type: "string" },
                        level: { type: "string" },
                        committee_role: { type: "string" },
                        source_section: { type: "string" },
                      },
                      required: ["committee_role"],
                      additionalProperties: false,
                    },
                  },
                  awards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        year: { type: "number" },
                        award: { type: "string" },
                        institution_organization: { type: "string" },
                        source_section: { type: "string" },
                      },
                      required: ["award"],
                      additionalProperties: false,
                    },
                  },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: ["cv_type", "personal_info", "qualifications", "intellectual_contributions", "engagements", "services", "awards"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_cv_data" } },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const message = response.status === 429
        ? "Rate limit exceeded, please try again later."
        : response.status === 402
          ? "Payment required. Please add credits."
          : `AI gateway error: ${response.status}`;
      console.error("AI gateway error:", response.status, body);
      return json({ ok: false, error: message, diagnostics: { error_stage: "ai_gateway", status: response.status } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ ok: false, error: "No structured extraction returned", diagnostics: { error_stage: "tool_call_missing" } });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    extracted.qualifications = filterPlaceholderRows(extracted.qualifications || [], ["degree_certification", "institution"]);
    extracted.intellectual_contributions = filterPlaceholderRows(extracted.intellectual_contributions || [], ["title", "apa_citation", "authors"]);
    extracted.engagements = filterPlaceholderRows(extracted.engagements || [], ["activity", "details"]);
    extracted.services = filterPlaceholderRows(extracted.services || [], ["committee_role", "level"]);
    extracted.awards = filterPlaceholderRows(extracted.awards || [], ["award"]);
    extracted.professional_experience = filterPlaceholderRows(extracted.professional_experience || [], ["organization", "position_title"]);

    if (extracted.personal_info) {
      for (const [k, v] of Object.entries(extracted.personal_info)) {
        if (isPlaceholder(v)) extracted.personal_info[k] = null;
      }
    }

    return json({
      ok: true,
      data: extracted,
      warnings: extracted.warnings || [],
      diagnostics: {
        sections_detected: Object.keys(sections).filter((key) => sections[key]),
        text_length: cvText.length,
        ic_count: extracted.intellectual_contributions?.length || 0,
      },
    });
  } catch (e) {
    console.error("parse-cv error:", e);
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      diagnostics: { error_stage: "parse_cv_catch" },
    });
  }
});
