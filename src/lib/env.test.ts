import { describe, expect, it } from "vitest";

import {
  parseEmailBatchSize,
  parseEmailMode,
  parseRecipientGuardMode,
  parseTestRecipientAllowlist,
} from "./env";

describe("parseEmailMode", () => {
  it("defaults missing or invalid values to preview", () => {
    expect(parseEmailMode(undefined)).toBe("preview");
    expect(parseEmailMode("LIVE")).toBe("preview");
  });

  it.each(["preview", "draft", "live"] as const)("accepts %s", (mode) => {
    expect(parseEmailMode(mode)).toBe(mode);
  });
});

describe("queue environment parsing", () => {
  it("fails closed to allowlist mode when recipient guard mode is missing or invalid", () => {
    expect(parseRecipientGuardMode(undefined)).toBe("allowlist");
    expect(parseRecipientGuardMode("")).toBe("allowlist");
    expect(parseRecipientGuardMode("PRODUCTION")).toBe("allowlist");
    expect(parseRecipientGuardMode("disabled")).toBe("allowlist");
  });

  it.each(["allowlist", "production"] as const)("accepts recipient guard mode %s", (mode) => {
    expect(parseRecipientGuardMode(mode)).toBe(mode);
  });

  it("defaults unsafe batch values to five", () => {
    expect(parseEmailBatchSize(undefined)).toBe(5);
    expect(parseEmailBatchSize("0")).toBe(5);
    expect(parseEmailBatchSize("-1")).toBe(5);
    expect(parseEmailBatchSize("1.5")).toBe(5);
    expect(parseEmailBatchSize("NaN")).toBe(5);
    expect(parseEmailBatchSize("500")).toBe(5);
    expect(parseEmailBatchSize("8")).toBe(8);
  });

  it("normalizes an optional recipient allowlist", () => {
    expect(parseTestRecipientAllowlist(" Test@Example.com, second@example.com ")).toEqual(
      new Set(["test@example.com", "second@example.com"]),
    );
    expect(parseTestRecipientAllowlist(" ")).toBeNull();
    expect(() => parseTestRecipientAllowlist("not-an-email")).toThrow();
  });
});
