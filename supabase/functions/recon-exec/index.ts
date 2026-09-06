// TEMPORARY maintenance endpoint used once for the four-profile CV reconciliation.
// Token-gated and deleted immediately after the correction script is applied.
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

Deno.serve(async (req) => {
  const token = Deno.env.get("RECON_EXEC_TOKEN");
  if (!token || req.headers.get("x-recon-token") !== token) {
    return new Response("forbidden", { status: 403 });
  }
  const sql = await req.text();
  if (!sql.trim()) return new Response("empty", { status: 400 });

  const client = new Client(Deno.env.get("SUPABASE_DB_URL")!);
  try {
    await client.connect();
    const res = await client.queryArray(sql);
    return new Response(JSON.stringify({ ok: true, result: String(res.rowCount ?? "") }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
});
