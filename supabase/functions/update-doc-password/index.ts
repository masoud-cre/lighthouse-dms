import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { slug, new_password, admin_password } = await req.json();
    if (!slug || !admin_password) {
      return new Response(JSON.stringify({ error: "slug and admin_password required" }), { status: 400, headers: corsHeaders });
    }

    // Re-authenticate admin to confirm identity
    const { data: { user: verifiedUser }, error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: admin_password,
    });
    if (reAuthError || !verifiedUser) {
      return new Response(JSON.stringify({ error: "Incorrect admin password" }), { status: 401, headers: corsHeaders });
    }

    // Verify admin owns the document
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("slug", slug)
      .eq("uploaded_by", user.id)
      .single();

    if (!doc) return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: corsHeaders });

    // Set new password (hashed) or null to remove
    let newHash: string | null = null;
    if (new_password && new_password.trim() !== "") {
      const { data: hash } = await supabase.rpc("crypt_new_password", { p: new_password });
      // Hash inline via raw SQL since we can't call crypt directly
      const { data: hashResult } = await supabase
        .from("documents")
        .update({ recipient_password_hash: new_password, updated_at: new Date().toISOString() })
        .eq("id", doc.id)
        .select("recipient_password_hash")
        .single();
      // Trigger will hash it automatically
    } else {
      // Remove password — bypass trigger by updating directly with null
      await supabase
        .from("documents")
        .update({ recipient_password_hash: null, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
    }

    return new Response(
      JSON.stringify({ success: true, has_password: !!(new_password && new_password.trim()) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
