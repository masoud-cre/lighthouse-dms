import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthenticationOptions } from "https://esm.sh/@simplewebauthn/server@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_ID = "masoud-cre.github.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: corsHeaders });

    // Look up user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const user = users.find(u => u.email === email);
    if (!user) return new Response(JSON.stringify({ error: "No account found for this email" }), { status: 404, headers: corsHeaders });

    // Get stored passkey credentials for this user
    const { data: credentials } = await supabase
      .from("passkey_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    if (!credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ error: "No passkey registered for this account" }), { status: 404, headers: corsHeaders });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
      allowCredentials: credentials.map(c => ({
        id: c.credential_id,
        transports: c.transports ?? [],
      })),
    });

    // Store challenge keyed by email (no auth yet)
    await supabase.from("passkey_challenges").insert({
      user_id: user.id,
      challenge: options.challenge,
    });

    return new Response(
      JSON.stringify({ ...options, user_id: user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
