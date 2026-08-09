import { describe, expect, it } from "vitest";

import { GOOGLE_OAUTH_SCOPES } from "./scopes";

describe("Gmail OAuth scopes", () => {
  it("requests identity plus compose only", () => {
    expect(GOOGLE_OAUTH_SCOPES).toEqual([
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.compose",
    ]);
    expect(GOOGLE_OAUTH_SCOPES.join(" ")).not.toMatch(/gmail\.(readonly|modify|metadata)|spreadsheets|drive|contacts/);
  });
});
