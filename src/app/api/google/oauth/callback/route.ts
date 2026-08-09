import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAppUrl, getGoogleOAuthConfig } from "@/lib/env";
import { createGoogleOAuthClient } from "@/lib/google-oauth/client";
import { OAUTH_STATE_COOKIE } from "@/lib/google-oauth/constants";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { hashToken, secureStringsEqual } from "@/lib/security/tokens";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

function completionResponse(path: "/connect/success" | "/connect/error") {
  const response = NextResponse.redirect(`${getAppUrl()}${path}`);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/google/oauth/callback",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.has("error") || !code || !state) return completionResponse("/connect/error");

    const cookieStore = await cookies();
    const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
    if (!cookieState || !secureStringsEqual(cookieState, state)) {
      return completionResponse("/connect/error");
    }

    const service = createSupabaseServiceClient();
    const { data: stateRows, error: stateError } = await service.rpc("consume_sender_oauth_state", {
      p_state_hash: hashToken(state),
    });
    const storedState = stateRows?.[0];
    if (stateError || !storedState) return completionResponse("/connect/error");

    const oauthClient = createGoogleOAuthClient();
    const { tokens } = await oauthClient.getToken({
      code,
      codeVerifier: decryptSecret(storedState.encrypted_code_verifier),
    });
    const grantedScopes = new Set((tokens.scope ?? "").split(" ").filter(Boolean));
    if (!tokens.refresh_token || !tokens.id_token || !tokens.access_token || !grantedScopes.has(GMAIL_COMPOSE_SCOPE)) {
      return completionResponse("/connect/error");
    }

    const config = getGoogleOAuthConfig();
    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email_verified) return completionResponse("/connect/error");

    oauthClient.setCredentials({ access_token: tokens.access_token });
    const gmail = google.gmail({ version: "v1", auth: oauthClient });
    const profile = await gmail.users.getProfile({ fields: "emailAddress", userId: "me" });
    const email = profile.data.emailAddress?.trim().toLowerCase();
    if (!email) return completionResponse("/connect/error");

    const { error: completionError } = await service.rpc("complete_sender_connection", {
      p_sender_invite_id: storedState.sender_invite_id,
      p_email: email,
      p_google_account_id: identity.sub,
      p_encrypted_refresh_token: encryptSecret(tokens.refresh_token),
    });

    return completionResponse(completionError ? "/connect/error" : "/connect/success");
  } catch {
    return completionResponse("/connect/error");
  }
}
