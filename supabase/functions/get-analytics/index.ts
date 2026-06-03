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

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const url  = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (slug) {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, name, description, recipient_password_hash, is_active, expires_at, max_views, tags, version_number, created_at")
        .eq("slug", slug)
        .single();

      if (!doc) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

      const { data: logs } = await supabase
        .from("access_logs")
        .select("action, accessed_at, ip_address, user_agent")
        .eq("document_id", doc.id)
        .order("accessed_at", { ascending: false });

      const views     = logs?.filter(l => l.action === "view").length ?? 0;
      const downloads = logs?.filter(l => l.action === "download").length ?? 0;

      return new Response(
        JSON.stringify({
          doc: doc.name, description: doc.description,
          has_password: !!doc.recipient_password_hash,
          is_active: doc.is_active,
          expires_at: doc.expires_at,
          max_views: doc.max_views,
          tags: doc.tags ?? [],
          version_number: doc.version_number,
          views, downloads, logs,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: docs } = await supabase
      .from("documents")
      .select("id, slug, short_code, name, created_at, recipient_password_hash, is_active, expires_at, max_views, tags, version_number, access_logs(action)")
      .order("created_at", { ascending: false });

    const summary = docs?.map(doc => ({
      slug: doc.slug,
      short_code: doc.short_code,
      name: doc.name,
      created_at: doc.created_at,
      has_password: !!doc.recipient_password_hash,
      is_active: doc.is_active,
      expires_at: doc.expires_at,
      max_views: doc.max_views,
      tags: doc.tags ?? [],
      version_number: doc.version_number,
      views:     (doc.access_logs as { action: string }[]).filter(l => l.action === "view").length,
      downloads: (doc.access_logs as { action: string }[]).filter(l => l.action === "download").length,
    })) ?? [];

    return new Response(JSON.stringify({ documents: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
