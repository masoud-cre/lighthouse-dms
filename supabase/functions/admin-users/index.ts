import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function requireAdmin(authHeader: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") throw new Error("Admin access required");
  return { supabase, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const url    = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const { supabase } = await requireAdmin(authHeader);

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (req.method === "GET" || action === "list") {
      const { data: { users }, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name, role");

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

      const list = users.map(u => ({
        id:         u.id,
        email:      u.email,
        full_name:  profileMap[u.id]?.full_name ?? "",
        role:       profileMap[u.id]?.role ?? "standard",
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
      }));

      return new Response(JSON.stringify({ users: list }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // ── INVITE ───────────────────────────────────────────────────────────────
    if (action === "invite") {
      const { email, full_name, role = "standard" } = body;
      if (!email) throw new Error("email required");

      // Create user with a temp password (email confirmed)
      const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "Aa1!";
      const { data: { user: newUser }, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (error) throw error;

      // Create profile
      await supabase.from("user_profiles").upsert({
        id: newUser!.id,
        full_name: full_name || email.split("@")[0],
        role,
      });

      return new Response(JSON.stringify({ success: true, user_id: newUser!.id, temp_password: tempPassword }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (action === "update") {
      const { user_id, role, full_name, new_password } = body;
      if (!user_id) throw new Error("user_id required");

      if (role || full_name) {
        await supabase.from("user_profiles").upsert({
          id: user_id,
          ...(role && { role }),
          ...(full_name && { full_name }),
          updated_at: new Date().toISOString(),
        });
      }

      if (new_password) {
        const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) throw new Error("user_id required");

      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    const status = err.message === "Unauthorized" || err.message === "Admin access required" ? 403 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
