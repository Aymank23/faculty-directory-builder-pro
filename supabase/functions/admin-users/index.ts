// Admin-only user administration: create, delete and reset passwords for app users.
// The caller's admin role is verified server-side on every request.
import { corsHeaders, json, loginEmail, requireAppUser, serviceClient } from "../_shared/appAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = serviceClient();
  const caller = await requireAppUser(req, admin);
  if (!caller) return json({ error: "Not signed in" }, 401);

  const { data: isAdmin } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.auth_user_id)
    .eq("role", "admin")
    .maybeSingle();
  if (!isAdmin) return json({ error: "Admins only" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = String(body.action ?? "");
  const str = (v: unknown, max = 200) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 && s.length <= max ? s : "";
  };

  if (action === "create") {
    const username = str(body.username);
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = str(body.full_name, 300);
    const role = ["admin", "hod", "faculty"].includes(String(body.role)) ? String(body.role) : "faculty";
    const department = str(body.department, 200) || null;
    const campus = str(body.campus, 200) || null;

    if (!username || !fullName || password.length < 8) {
      return json({ error: "Username, full name and a password of at least 8 characters are required" }, 400);
    }

    const { data: existing } = await admin.from("app_users").select("user_id").ilike("username", username).maybeSingle();
    if (existing) return json({ error: "A user with that username already exists" }, 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: loginEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createErr || !created?.user) return json({ error: createErr?.message ?? "Could not create login" }, 400);

    const { error: insErr } = await admin.from("app_users").insert({
      username,
      password_hash: "managed-by-auth",
      full_name: fullName,
      role,
      department,
      campus,
      auth_user_id: created.user.id,
    });
    if (insErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: insErr.message }, 400);
    }

    await admin.from("user_roles").upsert({ user_id: created.user.id, role }, { onConflict: "user_id,role" });
    await admin.from("audit_log").insert({
      user_id: caller.user_id,
      action: "user_created",
      target_table: "app_users",
      details: { username, role },
    });
    return json({ ok: true });
  }

  if (action === "delete") {
    const userId = str(body.user_id, 64);
    if (!userId) return json({ error: "Missing user" }, 400);
    if (userId === caller.user_id) return json({ error: "You cannot delete your own account" }, 400);

    const { data: target } = await admin
      .from("app_users")
      .select("user_id, username, auth_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) return json({ error: "User not found" }, 404);

    const { error: delErr } = await admin.from("app_users").delete().eq("user_id", userId);
    if (delErr) return json({ error: delErr.message }, 400);
    if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);

    await admin.from("audit_log").insert({
      user_id: caller.user_id,
      action: "user_deleted",
      target_table: "app_users",
      target_record: userId,
      details: { username: target.username },
    });
    return json({ ok: true });
  }

  if (action === "reset_password") {
    const userId = str(body.user_id, 64);
    const password = typeof body.password === "string" ? body.password : "";
    if (!userId || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: target } = await admin
      .from("app_users")
      .select("user_id, auth_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!target?.auth_user_id) return json({ error: "User not found" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
    if (updErr) return json({ error: updErr.message }, 400);

    await admin.from("audit_log").insert({
      user_id: caller.user_id,
      action: "password_reset",
      target_table: "app_users",
      target_record: userId,
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
