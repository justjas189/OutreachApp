import { describe, expect, it } from "vitest";

import { classifyGmailError } from "./errors";

describe("Gmail retry classification", () => {
  it.each([408, 429, 500, 502, 503, 504])("retries transient HTTP %s", (status) => {
    expect(classifyGmailError({ response: { status } }).transient).toBe(true);
  });

  it("retries Gmail rate-limit reasons but not authorization errors", () => {
    expect(classifyGmailError({ response: { status: 403, data: { error: { errors: [{ reason: "rateLimitExceeded" }] } } } }).transient).toBe(true);
    expect(classifyGmailError({ response: { status: 401 } })).toMatchObject({ transient: false, code: "gmail_401" });
  });
});
