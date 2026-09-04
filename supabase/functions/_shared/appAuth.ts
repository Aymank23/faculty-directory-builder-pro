// Shared helpers for the custom username/password login backed by server-side auth accounts.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Deterministic login email for a username (usernames are usually already emails). */
export function loginEmail(username: string): string {
  const u = username.trim().toLowerCase();
  if (u.includes("@")) return u;
  const slug = u.replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || "user";
  return `${slug}@aksob.local`;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolve the calling user's app_users row from their bearer token. Returns null when unauthenticated. */
export async function requireAppUser(req: Request, admin: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: appUser } = await admin
    .from("app_users")
    .select("user_id, username, full_name, role, department, campus, status, auth_user_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!appUser || appUser.status !== "active") return null;
  return appUser as {
    user_id: string;
    username: string;
    full_name: string;
    role: string;
    department: string | null;
    campus: string | null;
    status: string;
    auth_user_id: string;
  };
}
