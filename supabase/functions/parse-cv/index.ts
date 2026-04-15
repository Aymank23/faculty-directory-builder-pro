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

    const systemPrompt = `You are a CV/resume parser for an AACSB faculty management system at a business school. Extract structured data from the provided CV text. Return data using the extract_cv_data tool. Only include information that is clearly present in the CV. For fields you cannot find, use null or empty arrays.

IMPORTANT GUIDELINES:
- The CV may follow either "Faculty CV – Academics" or "Faculty CV – Practitioners" format
- For the personal_info section, extract the faculty member's name, department, campus, rank, employee ID, status, and degree info
- For qualifications: extract academic degrees, certifications, diplomas from Section 2
- For intellectual_contributions: This is CRITICAL. Extract ALL publications and ICs from Section 3:
  - Section 3.1: Peer-Reviewed Journal Articles (PRJs) - extract citation, Scopus rank/quartile, IC category
  - Section 3.2: Books - extract citation, publisher, IC category  
  - Section 3.3: Chapters in Edited Books - extract citation, publisher, IC category
  - Section 3.4: Other Intellectual Contributions - extract year, type, category, details
  - Section 4.2 (practitioner): Academic Engagement Activities
  - Parse APA citations to extract: authors, year, title, journal/outlet, DOI
  - Map Scopus Rank to quartile (Q1, Q2, Q3, Q4)
  - Map IC Category to: "Basic/Discovery Scholarship", "Applied/Integration Scholarship", or "Teaching & Learning Scholarship"
- For engagements: Professional Engagement Activities (Section 4 academic / Section 5 practitioner)
- For services: Service Contributions (Section 5 academic / Section 6 practitioner)
- For awards: Awards & Recognition (Section 6 academic / Section 7 practitioner)
- SKIP placeholder rows like "Click or tap here to enter text", "Enter Year", "Choose an item"
- For year fields, extract just the 4-digit year number
- For from_to fields, use format like "2020–2024" or "2021–Present"`;

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
          { role: "user", content: `Parse the following CV and extract ALL structured data, especially intellectual contributions:\n\n${cvText.slice(0, 50000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_cv_data",
              description: "Extract structured CV sections from faculty CV text including intellectual contributions",
              parameters: {
                type: "object",
                properties: {
                  personal_info: {
                    type: "object",
                    properties: {
                      first_name: { type: "string" },
                      last_name: { type: "string" },
                      department: { type: "string" },
                      campus: { type: "string" },
                      academic_rank: { type: "string" },
                      employee_id: { type: "string" },
                      status: { type: "string" },
                      highest_degree: { type: "string" },
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
                        year: { type: "number" },
                        field_area: { type: "string" },
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
                        title: { type: "string", description: "Full APA citation or title of the IC" },
                        authors: { type: "string" },
                        year: { type: "number" },
                        journal_outlet: { type: "string" },
                        ic_type: { type: "string", description: "PRJ, Book, Chapter, Conference Paper, Editorial Work, Other" },
                        ic_category: { type: "string", description: "Basic/Discovery Scholarship, Applied/Integration Scholarship, or Teaching & Learning Scholarship" },
                        quartile: { type: "string", description: "Q1, Q2, Q3, Q4" },
                        doi: { type: "string" },
                        apa_citation: { type: "string", description: "Full APA-style citation" },
                        confidence: { type: "string", description: "high, medium, or low - how confident the parser is about this extraction" },
                      },
                      required: ["title"],
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
                      },
                      required: ["award"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["qualifications", "engagements", "services", "awards", "intellectual_contributions"],
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
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const extracted = JSON.parse(toolCall.function.arguments);

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
