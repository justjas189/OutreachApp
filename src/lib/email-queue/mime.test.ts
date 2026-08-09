import { describe, expect, it } from "vitest";

import { buildRawEmail } from "./mime";

describe("Gmail MIME creation", () => {
  it("creates base64url RFC email without exposing content in headers", () => {
    const raw = buildRawEmail({
      queueId: "019fe2aa-b0aa-78a0-a05b-f946aea5fd58",
      to: "recipient@example.com",
      from: "sender@example.com",
      subject: "Hello José",
      body: "Line one\nLine two",
    });
    const message = Buffer.from(raw, "base64url").toString("utf8");
    expect(message).toContain("To: recipient@example.com\r\nFrom: sender@example.com");
    expect(message).toContain("Subject: =?UTF-8?B?");
    expect(message).toContain("Content-Transfer-Encoding: base64");
    expect(message).not.toContain("Line one");
  });

  it("rejects subject header injection", () => {
    expect(() => buildRawEmail({ queueId: "id", to: "to@example.com", from: "from@example.com", subject: "Hi\nBcc: bad@example.com", body: "Body" })).toThrow();
  });
});
