// Username/password login. Credentials are verified server-side; the browser only
// ever receives a short-lived session token, never password material.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json, loginEmail, serviceClient } from "../_shared/appAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || username.length > 200 || !password || password.length > 200) {
    return json({ error: "Invalid username or password" }, 400);
  }

  const admin = serviceClient();
  const { data: appUser } = await admin
    .from("app_users")
    .select("user_id, username, full_name, role, department, campus, status, must_change_password, auth_user_id")
    .ilike("username", username)
    .eq("status", "active")
    .maybeSingle();

  // Same generic error for unknown user and wrong password.
  if (!appUser) return json({ error: "Invalid username or password" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: loginEmail(appUser.username),
    password,
  });

  if (signInError || !signIn.session) return json({ error: "Invalid username or password" }, 401);

  if (!appUser.auth_user_id) {
    await admin.from("app_users").update({ auth_user_id: signIn.user!.id }).eq("user_id", appUser.user_id);
    await admin.from("user_roles").upsert(
      { user_id: signIn.user!.id, role: appUser.role },
      { onConflict: "user_id,role" },
    );
  }

  return json({
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
    user: {
      id: appUser.user_id,
      username: appUser.username,
      full_name: appUser.full_name,
      role: appUser.role,
      department: appUser.department,
      campus: appUser.campus ?? null,
      must_change_password: appUser.must_change_password,
    },
  });
});
