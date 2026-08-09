import { describe, expect, it } from "vitest";

import { generateSecureToken, getInviteAvailability, hashToken } from "./tokens";

describe("sender invitation security", () => {
  it("generates random tokens and stores stable hashes instead of raw values", () => {
    const first = generateSecureToken();
    const second = generateSecureToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(first)).not.toContain(first);
  });

  it("rejects expired invitations", () => {
    expect(
      getInviteAvailability(
        { expires_at: "2026-01-01T00:00:00.000Z", used_at: null },
        new Date("2026-01-01T00:00:01.000Z"),
      ),
    ).toBe("EXPIRED");
  });

  it("treats a used invitation as unavailable even before expiry", () => {
    expect(
      getInviteAvailability(
        {
          expires_at: "2026-01-02T00:00:00.000Z",
          used_at: "2026-01-01T00:00:00.000Z",
        },
        new Date("2026-01-01T12:00:00.000Z"),
      ),
    ).toBe("USED");
  });
});
