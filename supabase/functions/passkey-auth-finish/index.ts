import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Native Deno WebAuthn verification — zero external dependencies ──
// Works with Chrome passkeys, Touch ID, Face ID, and hardware keys.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_ID  = "masoud-cre.github.io";
const ORIGIN = "https://masoud-cre.github.io";

/** base64url → Uint8Array */
function b64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=");
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
}

/**
 * Import a COSE EC2 / ES256 public key into Web Crypto.
 * Supports the P-256 curve used by Chrome, Safari, and FIDO2 authenticators.
 */
async function importCOSEKey(cose: Uint8Array): Promise<CryptoKey> {
  // Locate x (-2 = 0x21) and y (-3 = 0x22) in the CBOR-encoded COSE map.
  // Both are 32-byte bstr values encoded as 0x58 0x20 <32 bytes>.
  let xStart = -1, yStart = -1;
  for (let i = 0; i < cose.length - 2; i++) {
    if (cose[i] === 0x21 && cose[i+1] === 0x58 && cose[i+2] === 0x20) xStart = i + 3;
    if (cose[i] === 0x22 && cose[i+1] === 0x58 && cose[i+2] === 0x20) yStart = i + 3;
  }
  if (xStart < 0 || yStart < 0 || xStart + 32 > cose.length || yStart + 32 > cose.length) {
    throw new Error("Cannot parse COSE public key — only ES256/P-256 is supported");
  }
  const toB64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: toB64url(cose.slice(xStart, xStart+32)), y: toB64url(cose.slice(yStart, yStart+32)) },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

/**
 * Verify a WebAuthn authentication assertion.
 * Implements https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion
 */
async function verifyAssertion(params: {
  credential: any;
  expectedChallenge: string;
  storedPublicKey: Uint8Array;
  storedCounter: number;
}): Promise<{ verified: boolean; newCounter: number }> {
  const { credential: cr, expectedChallenge, storedPublicKey, storedCounter } = params;

  // Decode binary fields
  const clientDataRaw  = b64url(cr.response.clientDataJSON);
  const authData       = b64url(cr.response.authenticatorData);
  const signature      = b64url(cr.response.signature);
  const clientDataJSON = JSON.parse(new TextDecoder().decode(clientDataRaw));

  // §7.2 steps 7-10: verify clientDataJSON
  if (clientDataJSON.type !== "webauthn.get")       throw new Error("Wrong assertion type");
  if (clientDataJSON.challenge !== expectedChallenge) throw new Error("Challenge mismatch");
  if (clientDataJSON.origin !== ORIGIN)               throw new Error(`Origin mismatch: ${clientDataJSON.origin}`);

  // §7.2 step 11-12: verify RP ID hash (first 32 bytes of authData)
  const rpIdHash    = authData.slice(0, 32);
  const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(RP_ID)));
  if (!rpIdHash.every((v, i) => v === expectedHash[i])) throw new Error("RP ID hash mismatch");

  // §7.2 step 15: user-present flag (bit 0 of byte 32)
  if (!(authData[32] & 0x01)) throw new Error("User not present");

  // §7.2 step 17: extract and validate counter (bytes 33–36, big-endian)
  const dv         = new DataView(authData.buffer, authData.byteOffset);
  const newCounter = dv.getUint32(33, false);
  if (newCounter !== 0 && newCounter <= storedCounter) throw new Error("Counter replay detected");

  // §7.2 steps 19-21: verify signature over authData || SHA-256(clientDataJSON)
  const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataRaw));
  const signedData = new Uint8Array(authData.length + 32);
  signedData.set(authData, 0);
  signedData.set(clientDataHash, authData.length);

  const cryptoKey = await importCOSEKey(storedPublicKey);
  const verified  = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, signature, signedData);

  return { verified, newCounter };
}

// ─────────────────────────────────────────────────────────────────────────────

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

    // Look up stored credential
    const { data: storedCred, error: credErr } = await supabase
      .from("passkey_credentials")
      .select("credential_id, public_key, counter")
      .eq("user_id", user_id)
      .eq("credential_id", credential.id)
      .single();

    if (credErr || !storedCred) {
      return new Response(JSON.stringify({ error: "Passkey not found for this account" }), { status: 404, headers: corsHeaders });
    }

    // Look up active challenge
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

    // Decode stored public key (base64 → COSE Uint8Array)
    const storedPublicKey = Uint8Array.from(atob(storedCred.public_key), c => c.charCodeAt(0));
    const storedCounter   = Number(storedCred.counter ?? 0);

    // Verify using native Deno Web Crypto
    let verified = false;
    let newCounter = storedCounter;
    try {
      const result = await verifyAssertion({
        credential,
        expectedChallenge: challengeRow.challenge,
        storedPublicKey,
        storedCounter,
      });
      verified   = result.verified;
      newCounter = result.newCounter;
    } catch (e) {
      return new Response(JSON.stringify({ error: `Passkey verification failed: ${e.message}` }), { status: 401, headers: corsHeaders });
    }

    if (!verified) {
      return new Response(JSON.stringify({ error: "Signature verification failed" }), { status: 401, headers: corsHeaders });
    }

    // Update counter + clean up challenge
    await supabase.from("passkey_credentials").update({ counter: newCounter }).eq("credential_id", storedCred.credential_id);
    await supabase.from("passkey_challenges").delete().eq("user_id", user_id);

    // Issue magic link token (no email — token returned directly for immediate exchange)
    const userResult = await supabase.auth.admin.getUserById(user_id);
    if (userResult.error || !userResult.data.user?.email) throw new Error("Could not retrieve user email");

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userResult.data.user.email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(linkError?.message ?? "Failed to generate session token");
    }

    return new Response(
      JSON.stringify({ success: true, token_hash: linkData.properties.hashed_token, type: "magiclink" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
