import "server-only";

import { google } from "googleapis";

import { getGoogleOAuthConfig } from "@/lib/env";

export { GOOGLE_OAUTH_SCOPES } from "./scopes";

export function createGoogleOAuthClient() {
  const config = getGoogleOAuthConfig();
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}
