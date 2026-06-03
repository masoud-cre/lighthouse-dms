import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the uploader is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const form = await req.formData();
    const file = form.get("file") as File;
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    const recipientPassword = form.get("recipient_password") as string;

    if (!file || !name) {
      return new Response(JSON.stringify({ error: "Missing required fields: file, name" }), { status: 400, headers: corsHeaders });
    }

    // Generate a unique slug
    const slug = crypto.randomUUID().split("-")[0] + crypto.randomUUID().split("-")[0];
    const short_code = crypto.randomUUID().replace(/-/g, "").slice(0, 7);

    // Store file under user's folder for RLS: {userId}/{slug}/{filename}
    const filePath = `${user.id}/${slug}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    // Hash the recipient password using pgcrypto
    const { data: hashData, error: hashError } = await supabase.rpc("crypt_password", {
      password: recipientPassword,
    }).single();

    // Fallback: hash via SQL directly
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({
        slug,
        short_code,
        name,
        description,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        recipient_password_hash: (recipientPassword && recipientPassword.trim()) ? recipientPassword : null,
        uploaded_by: user.id,
      })
      .select("id, slug, short_code, name")
      .single();

    if (docError) {
      // Cleanup uploaded file on DB error
      await supabase.storage.from("documents").remove([filePath]);
      throw docError;
    }

    return new Response(
      JSON.stringify({ success: true, slug: docData.slug, short_code: docData.short_code, name: docData.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
