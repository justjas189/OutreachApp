import { describe, expect, it } from "vitest";

import { isAdminClaims } from "./claims";

describe("isAdminClaims", () => {
  it("accepts an admin role only from app_metadata", () => {
    expect(isAdminClaims({ app_metadata: { role: "admin" } })).toBe(true);
  });

  it("never trusts user-editable user_metadata", () => {
    expect(
      isAdminClaims({
        app_metadata: { role: "sender" },
        user_metadata: { role: "admin" },
      }),
    ).toBe(false);
  });

  it("does not authorize a sender as an admin", () => {
    expect(isAdminClaims({ app_metadata: { role: "sender" } })).toBe(false);
  });

  it("rejects absent or malformed claims", () => {
    expect(isAdminClaims(null)).toBe(false);
    expect(isAdminClaims({ app_metadata: "admin" })).toBe(false);
  });
});
