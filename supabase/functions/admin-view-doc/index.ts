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

    const { slug } = await req.json();
    if (!slug) return new Response(JSON.stringify({ error: "slug required" }), { status: 400, headers: corsHeaders });

    // Fetch doc — must be owned by this user
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, description, file_path, file_type")
      .eq("slug", slug)
      .eq("uploaded_by", user.id)
      .single();

    if (error || !doc) return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: corsHeaders });

    // Generate 1-hour admin signed URL (longer than recipient URLs)
    const { data: signedUrl, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 3600);

    if (signedError || !signedUrl) throw signedError;

    return new Response(
      JSON.stringify({ success: true, name: doc.name, description: doc.description, file_type: doc.file_type, signed_url: signedUrl.signedUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
