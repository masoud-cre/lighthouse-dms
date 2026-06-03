import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_ID  = "masoud-cre.github.io";
const ORIGIN = "https://masoud-cre.github.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { credential, user_id } = await req.json();
    if (!credential || !user_id) {
      return new Response(JSON.stringify({ error: "credential and user_id required" }), { status: 400, headers: corsHeaders });
    }

    // Get stored credential — match by user + credential ID
    const { data: storedCred, error: credErr } = await supabase
      .from("passkey_credentials")
      .select("credential_id, public_key, counter")
      .eq("user_id", user_id)
      .eq("credential_id", credential.id)
      .single();

    if (credErr || !storedCred) {
      return new Response(JSON.stringify({ error: "Passkey not found for this account" }), { status: 404, headers: corsHeaders });
    }

    // Get challenge
    const { data: challengeRow } = await supabase
      .from("passkey_challenges")
      .select("challenge")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!challengeRow) {
      return new Response(JSON.stringify({ error: "No active challenge — please try again" }), { status: 400, headers: corsHeaders });
    }

    // Decode stored public key (base64 → Uint8Array)
    const publicKeyBytes = Uint8Array.from(atob(storedCred.public_key), c => c.charCodeAt(0));

    // ── FIX: coerce counter to number — PostgreSQL may return null ──
    const storedCounter = Number(storedCred.counter ?? 0);

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: storedCred.credential_id,
          publicKey: publicKeyBytes,
          counter: storedCounter,           // always a number now
        },
      });
    } catch (verifyErr) {
      // Surface the internal library error clearly
      return new Response(
        JSON.stringify({ error: `Verification error: ${verifyErr.message}` }),
        { status: 401, headers: corsHeaders }
      );
    }

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: "Passkey verification failed" }), { status: 401, headers: corsHeaders });
    }

    // ── FIX: safe access to authenticationInfo ──
    const newCounter = verification.authenticationInfo?.newCounter ?? storedCounter;

    // Update counter to prevent replay attacks
    await supabase.from("passkey_credentials")
      .update({ counter: newCounter })
      .eq("credential_id", storedCred.credential_id);

    // Clean up challenge
    await supabase.from("passkey_challenges").delete().eq("user_id", user_id);

    // Issue session via magic link token (no email sent — token returned directly)
    const userResult = await supabase.auth.admin.getUserById(user_id);
    if (userResult.error || !userResult.data.user?.email) {
      throw new Error("Could not retrieve user email");
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userResult.data.user.email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(linkError?.message ?? "Failed to generate session token");
    }

    return new Response(
      JSON.stringify({
        success: true,
        token_hash: linkData.properties.hashed_token,
        type: "magiclink",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
