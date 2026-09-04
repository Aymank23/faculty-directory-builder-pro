import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

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

/**
 * Parse Word XML (document.xml) and extract text preserving structure.
 */
function parseWordXml(xml: string): string {
  const lines: string[] = [];

  const blocks = xml.match(/<w:tbl[ >][\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || [];

  for (const block of blocks) {
    if (block.startsWith('<w:tbl')) {
      const rows = block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
      for (const row of rows) {
        const cells = row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
        const cellTexts = cells.map(cell => {
          // Split the cell into paragraphs: runs inside a paragraph must be
          // concatenated with NO separator (Word splits words across runs),
          // while separate paragraphs are joined with a space.
          const paras = cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [cell];
          return paras.map(para => {
            const tMatches = para.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
            return tMatches.map(m => {
              const match = m.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
              return match ? match[1] : '';
            }).join('');
          }).join(' ').replace(/\s+/g, ' ').trim();
        });

        if (cellTexts.some(cell => cell.length > 0)) {
          lines.push(cellTexts.join(' | '));
        }
      }
      continue;
    }

    const textMatches = block.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    const texts = textMatches.map(m => {
      const match = m.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
      return match ? match[1] : '';
    });

    const line = texts.join('').trim();
    if (!line) continue;

    const styleMatch = block.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const style = styleMatch ? styleMatch[1] : '';

    if (style.toLowerCase().includes('heading') || style.match(/^h\d$/i)) {
      lines.push(`\n## ${line}\n`);
    } else {
      lines.push(line);
    }
  }

  return lines.join('\n');
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
