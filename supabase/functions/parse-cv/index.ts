import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvText } = await req.json();
    if (!cvText || typeof cvText !== "string") {
      return new Response(JSON.stringify({ error: "cvText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert CV parser for an AACSB faculty management system at a Lebanese business school (AKSOB at LAU).

You will receive the full text of a faculty CV in one of two formats:
- "Faculty CV – Academics" 
- "Faculty CV – Practitioners"

Your task: Extract ALL structured data from EVERY section. Return data using the extract_cv_data tool.

## CRITICAL RULES

1. **EXTRACT EVERYTHING** — Do NOT skip any section. Do NOT partially extract. If data exists, extract it.
2. **FILTER PLACEHOLDERS** — NEVER include rows where ALL values are placeholders. Placeholders include:
   - "Click or tap here to enter text"
   - "Choose an item"  
   - "Enter Year"
   - "Enter text"
   - "Click or tap to enter a date"
   - Empty cells
   If a row has at least one real value and rest are placeholders, include the row but set placeholder fields to null.
3. **SECTION-BASED PARSING** — Parse each section independently. Track which section each item came from.
4. **TABLE PARSING** — CV data is often in tables. Preserve column alignment. Each table row = one record.
5. **CITATION PARSING** — For PRJs and ICs, parse the full APA citation to extract: authors, year, title, journal, DOI.
   - DOIs often appear as https://doi.org/... — extract just the DOI identifier.
   - The year is typically in parentheses after authors, e.g. "Author (2024)."
6. **QUARTILE MAPPING** — Scopus Rank column contains Q1, Q2, Q3, Q4. Extract as-is.
7. **IC CATEGORY** — Map to exactly one of: "Basic/Discovery Scholarship", "Applied/Integration Scholarship", "Teaching & Learning Scholarship"
8. **IC TYPE** — For Section 3.1 / 4.1 PRJs → "PRJ". Section 3.2 Books → "Book". Section 3.3 Chapters → "Chapter". Section 3.4 / 4.2 Other → infer from content (Conference Paper, Editorial Work, etc.)
9. **CONFIDENCE** — Assign "high" if data is clear and complete, "medium" if some fields are ambiguous, "low" if uncertain.
10. **PRACTITIONER CVs** — Section 3 = Professional Experience. Section 4 = ICs. Section 4.2 = Academic Engagement Activities (extract as ICs with appropriate type). Section 5 = Professional Engagement Activities.
11. **ACADEMIC CVs** — Section 3 = ICs. Section 4 = Professional Engagement Activities. Section 5 = Service. Section 6 = Awards.
12. For entries that span multiple lines (common in citations), combine them into a single entry.
13. **source_section** — Always include which CV section the data came from (e.g., "3.1 PRJs", "4.2 Academic Engagement", "5 Service").`;

    // Use gemini-2.5-pro for best extraction quality on complex documents
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse the following CV completely. Extract ALL data from ALL sections. Do NOT skip anything.\n\n${cvText.slice(0, 80000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_cv_data",
              description: "Extract ALL structured CV sections from faculty CV text",
              parameters: {
                type: "object",
                properties: {
                  cv_type: {
                    type: "string",
                    description: "Either 'academic' or 'practitioner'",
                  },
                  personal_info: {
                    type: "object",
                    properties: {
                      first_name: { type: "string" },
                      last_name: { type: "string" },
                      department: { type: "string" },
                      campus: { type: "string" },
                      academic_rank: { type: "string" },
                      employee_id: { type: "string" },
                      ft_pt_status: { type: "string", description: "FT or PT based on Status field (Full-Time=FT, Part-Time=PT)" },
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
                        year: { type: "string", description: "Year as string (could be 'ongoing')" },
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
                        title: { type: "string", description: "Title of the work (not full citation)" },
                        authors: { type: "string" },
                        year: { type: "number" },
                        journal_outlet: { type: "string" },
                        ic_type: { type: "string", description: "PRJ, Book, Chapter, Conference Paper, Editorial Work, Designing/Delivering Online Courses, Other" },
                        ic_category: { type: "string", description: "Basic/Discovery Scholarship, Applied/Integration Scholarship, or Teaching & Learning Scholarship" },
                        quartile: { type: "string", description: "Q1, Q2, Q3, Q4, or null" },
                        doi: { type: "string" },
                        apa_citation: { type: "string", description: "Full APA-style citation as it appears in the CV" },
                        source_section: { type: "string", description: "e.g. 3.1 PRJs, 3.4 Other ICs, 4.2 Academic Engagement" },
                        raw_text: { type: "string", description: "The raw text from which this IC was extracted" },
                        confidence: { type: "string", description: "high, medium, or low" },
                      },
                      required: ["title", "confidence", "source_section"],
                      additionalProperties: false,
                    },
                  },
                  professional_experience: {
                    type: "array",
                    description: "For practitioner CVs - Section 3",
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error: " + response.status);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const extracted = JSON.parse(toolCall.function.arguments);

    // Post-processing: filter out any remaining placeholder-only entries
    const isPlaceholder = (v: any) => {
      if (v == null || v === '') return true;
      if (typeof v !== 'string') return false;
      const lower = v.toLowerCase().trim();
      return ['click or tap here to enter text', 'choose an item', 'enter year', 'enter text', 'click or tap to enter a date', 'enter year.'].includes(lower);
    };

    const filterPlaceholderRows = (arr: any[], requiredFields: string[]) => {
      if (!Array.isArray(arr)) return [];
      return arr.filter(row => {
        // At least one required field must have a real value
        return requiredFields.some(f => row[f] && !isPlaceholder(row[f]));
      }).map(row => {
        // Clean placeholder values to null
        const cleaned: any = {};
        for (const [k, v] of Object.entries(row)) {
          cleaned[k] = isPlaceholder(v) ? null : v;
        }
        return cleaned;
      });
    };

    extracted.qualifications = filterPlaceholderRows(extracted.qualifications || [], ['degree_certification', 'institution']);
    extracted.intellectual_contributions = filterPlaceholderRows(extracted.intellectual_contributions || [], ['title', 'apa_citation', 'authors']);
    extracted.engagements = filterPlaceholderRows(extracted.engagements || [], ['activity', 'details']);
    extracted.services = filterPlaceholderRows(extracted.services || [], ['committee_role', 'level']);
    extracted.awards = filterPlaceholderRows(extracted.awards || [], ['award']);
    extracted.professional_experience = filterPlaceholderRows(extracted.professional_experience || [], ['organization', 'position_title']);

    // Clean personal_info placeholders
    if (extracted.personal_info) {
      for (const [k, v] of Object.entries(extracted.personal_info)) {
        if (isPlaceholder(v)) extracted.personal_info[k] = null;
      }
    }

    console.log(`Extracted: ${extracted.intellectual_contributions?.length || 0} ICs, ${extracted.qualifications?.length || 0} qualifications, ${extracted.professional_experience?.length || 0} prof exp`);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
