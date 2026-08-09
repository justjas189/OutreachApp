import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./encryption";

describe("OAuth token encryption", () => {
  const key = randomBytes(32).toString("base64url");

  it("round-trips a refresh token with authenticated AES-256-GCM encryption", () => {
    const encrypted = encryptSecret("safe-fake-refresh-token", key);

    expect(encrypted).not.toContain("safe-fake-refresh-token");
    expect(decryptSecret(encrypted, key)).toBe("safe-fake-refresh-token");
  });

  it("rejects ciphertext tampering", () => {
    const encrypted = encryptSecret("safe-fake-refresh-token", key);
    const parts = encrypted.split(".");
    const tag = Buffer.from(parts[3], "base64url");
    tag[0] ^= 1;
    parts[3] = tag.toString("base64url");
    const tampered = parts.join(".");

    expect(() => decryptSecret(tampered, key)).toThrow();
  });
});
