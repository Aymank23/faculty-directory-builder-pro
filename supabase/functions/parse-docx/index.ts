import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";
import { parseWordXml } from "./wordXml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Extracts readable text from a DOCX file (which is a ZIP of XML files).
 * Preserves paragraph structure and table content.
 */
async function extractDocxText(fileBytes: Uint8Array): Promise<string> {
  const zip = new JSZip();
  await zip.loadAsync(fileBytes);

  const parts: string[] = [];

  // Extract main document body
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (docXml) {
    parts.push(parseWordXml(docXml));
  }

  // Extract headers/footers for completeness
  for (const fileName of Object.keys(zip.files)) {
    if (fileName.match(/word\/(header|footer)\d*\.xml$/)) {
      const xml = await zip.file(fileName)?.async("string");
      if (xml) parts.push(parseWordXml(xml));
    }
  }

  return parts.join("\n\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const contentType = req.headers.get("content-type") || "";

    let fileBytes: Uint8Array;
    let fileName = "document.docx";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      fileName = file.name;
      fileBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      // JSON body with base64 data
      const body = await req.json();
      if (!body.fileData) {
        return new Response(JSON.stringify({ error: "fileData (base64) is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      fileName = body.fileName || fileName;
      // Decode base64
      const binaryString = atob(body.fileData);
      fileBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fileBytes[i] = binaryString.charCodeAt(i);
      }
    }

    console.log(`Parsing DOCX: ${fileName}, size: ${fileBytes.length} bytes`);

    const text = await extractDocxText(fileBytes);

    console.log(`Extracted ${text.length} chars from ${fileName}`);

    return new Response(JSON.stringify({ text, fileName, charCount: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-docx error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to parse DOCX" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
