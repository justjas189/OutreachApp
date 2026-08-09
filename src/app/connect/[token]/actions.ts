"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CodeChallengeMethod } from "google-auth-library";

import { createGoogleOAuthClient, GOOGLE_OAUTH_SCOPES } from "@/lib/google-oauth/client";
import { OAUTH_STATE_COOKIE } from "@/lib/google-oauth/constants";
import { createPkcePair } from "@/lib/google-oauth/pkce";
import { encryptSecret } from "@/lib/security/encryption";
import { generateSecureToken, hashToken, OAUTH_STATE_TTL_MS } from "@/lib/security/tokens";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function startGmailOAuthAction(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,200}$/.test(token)) {
    redirect("/connect/error");
  }

  const state = generateSecureToken();
  const pkce = createPkcePair();
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("begin_sender_oauth", {
    p_token_hash: hashToken(token),
    p_state_hash: hashToken(state),
    p_encrypted_code_verifier: encryptSecret(pkce.verifier),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) redirect("/connect/error");

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    path: "/api/google/oauth/callback",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const authorizationUrl = createGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    code_challenge: pkce.challenge,
    code_challenge_method: CodeChallengeMethod.S256,
    include_granted_scopes: false,
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
  });

  redirect(authorizationUrl);
}
