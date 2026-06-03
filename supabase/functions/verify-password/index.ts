import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiter: slug -> { count, resetAt }
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(slug: string): boolean {
  const now = Date.now();
  const entry = attempts.get(slug);
  if (!entry || now > entry.resetAt) {
    attempts.set(slug, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 5; // 5 attempts per minute per slug
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { slug, password } = await req.json();
    if (!slug || !password) {
      return new Response(JSON.stringify({ error: "slug and password required" }), { status: 400, headers: corsHeaders });
    }

    if (isRateLimited(slug)) {
      return new Response(JSON.stringify({ error: "Too many attempts. Try again in a minute." }), { status: 429, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, slug, name, description, file_path, recipient_password_hash")
      .eq("slug", slug)
      .single();

    if (error || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: corsHeaders });
    }

    // If no password set, allow access directly
    if (!doc.recipient_password_hash) {
      const { data: signedUrl, error: signedError } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 900);
      if (signedError || !signedUrl) throw signedError;
      await supabase.from("access_logs").insert({
        document_id: doc.id, action: "view",
        ip_address: req.headers.get("x-forwarded-for") ?? "unknown",
        user_agent: req.headers.get("user-agent") ?? "unknown",
      });
      return new Response(
        JSON.stringify({ success: true, document_id: doc.id, name: doc.name, description: doc.description, signed_url: signedUrl.signedUrl, expires_in: 900, no_password: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password using pgcrypto
    const { data: match } = await supabase.rpc("verify_password", {
      input_password: password,
      stored_hash: doc.recipient_password_hash,
    });

    if (!match) {
      return new Response(JSON.stringify({ error: "Incorrect password" }), { status: 401, headers: corsHeaders });
    }

    // Generate a signed URL valid for 15 minutes
    const { data: signedUrl, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 900); // 900 seconds = 15 min

    if (signedError || !signedUrl) throw signedError;

    // Log the view
    await supabase.from("access_logs").insert({
      document_id: doc.id,
      action: "view",
      ip_address: req.headers.get("x-forwarded-for") ?? "unknown",
      user_agent: req.headers.get("user-agent") ?? "unknown",
    });

    return new Response(
      JSON.stringify({
        success: true,
        document_id: doc.id,
        name: doc.name,
        description: doc.description,
        signed_url: signedUrl.signedUrl,
        expires_in: 900,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
