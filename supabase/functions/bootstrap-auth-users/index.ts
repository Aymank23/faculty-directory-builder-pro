// One-time migration: create a server-side auth account for every app_users row,
// carrying over the existing password so people keep their current credentials.
import { corsHeaders, json, loginEmail, serviceClient } from "../_shared/appAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = serviceClient();
  const { data: rows, error } = await admin
    .from("app_users")
    .select("user_id, username, password_hash, role, auth_user_id")
    .is("auth_user_id", null);

  if (error) return json({ error: error.message }, 500);

  let created = 0;
  let linked = 0;
  const failures: Array<{ username: string; reason: string }> = [];

  for (const row of rows ?? []) {
    const email = loginEmail(row.username);
    const password = String(row.password_hash ?? "").trim();
    if (password.length < 6) {
      failures.push({ username: row.username, reason: "password too short" });
      continue;
    }

    let authId: string | null = null;
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: row.username, app_user_id: row.user_id },
    });

    if (createdUser?.user) {
      authId = createdUser.user.id;
      created++;
    } else {
      // Already exists → find it and reset the password to the stored one.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!existing) {
        failures.push({ username: row.username, reason: createErr?.message ?? "unknown" });
        continue;
      }
      await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      authId = existing.id;
      linked++;
    }

    if (!authId) continue;

    const { error: upErr } = await admin
      .from("app_users")
      .update({ auth_user_id: authId })
      .eq("user_id", row.user_id);
    if (upErr) failures.push({ username: row.username, reason: upErr.message });

    await admin.from("user_roles").upsert(
      { user_id: authId, role: row.role },
      { onConflict: "user_id,role" },
    );
  }

  return json({ ok: failures.length === 0, pending: rows?.length ?? 0, created, linked, failures });
});
