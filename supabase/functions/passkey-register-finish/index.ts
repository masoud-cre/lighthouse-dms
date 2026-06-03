import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_ID     = "masoud-cre.github.io";
const ORIGIN    = "https://masoud-cre.github.io";

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

    const body = await req.json();

    // Fetch the most recent challenge for this user
    const { data: challengeRow } = await supabase
      .from("passkey_challenges")
      .select("challenge, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!challengeRow) return new Response(JSON.stringify({ error: "No active challenge" }), { status: 400, headers: corsHeaders });

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: "Verification failed" }), { status: 400, headers: corsHeaders });
    }

    // v10 flattened structure: credentialID, credentialPublicKey, counter are top-level
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo as any;

    // Encode public key as base64 string for storage
    const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(credentialPublicKey)));

    await supabase.from("passkey_credentials").insert({
      user_id: user.id,
      credential_id: credentialID,
      public_key: publicKeyBase64,
      counter: counter ?? 0,
      transports: body.response?.transports ?? [],
    });

    // Clean up challenge
    await supabase.from("passkey_challenges").delete().eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
