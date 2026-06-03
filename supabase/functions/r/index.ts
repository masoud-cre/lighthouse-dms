import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// URL shortener redirect: /functions/v1/r/{short_code}
// Redirects to the full recipient portal URL

const SITE_BASE = "https://masoud-cre.github.io/lighthouse-dms";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const short_code = url.pathname.split("/").filter(Boolean).pop();

  if (!short_code) {
    return new Response("Missing short code", { status: 400 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: doc, error } = await supabase
      .from("documents")
      .select("slug")
      .eq("short_code", short_code)
      .single();

    if (error || !doc) {
      return new Response("Document not found", { status: 404 });
    }

    return Response.redirect(`${SITE_BASE}/docs/?slug=${doc.slug}`, 302);
  } catch {
    return new Response("Server error", { status: 500 });
  }
});
