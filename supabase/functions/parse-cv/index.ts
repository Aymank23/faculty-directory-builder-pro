import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseCvText } from "./parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvText, enableAiParsing = false } = await req.json();
    const result = parseCvText(cvText, enableAiParsing);
    return json(result, result.ok ? 200 : 400);
  } catch (e) {
    console.error("parse-cv error:", e);
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      fallback: true,
      diagnostics: { error_stage: "parse_cv_catch" },
    }, 500);
  }
});
