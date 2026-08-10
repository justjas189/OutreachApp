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
      bodyHtml: "<p><strong>Line one</strong><br>Line two</p>",
    });
    const message = Buffer.from(raw, "base64url").toString("utf8");
    expect(message).toContain("To: recipient@example.com\r\nFrom: sender@example.com");
    expect(message).toContain("Subject: =?UTF-8?B?");
    expect(message).toContain("Content-Transfer-Encoding: base64");
    expect(message).toContain("Content-Type: multipart/alternative");
    expect(message).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(message).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(message).not.toContain("Line one");
    const parts = message.split(/\r\n/);
    expect(parts).toContain(Buffer.from("Line one\r\nLine two").toString("base64"));
    const htmlHeader = parts.indexOf('Content-Type: text/html; charset="UTF-8"');
    expect(Buffer.from(parts[htmlHeader + 3], "base64").toString("utf8"))
      .toBe("<p><strong>Line one</strong><br />Line two</p>");
  });

  it("creates an HTML fallback for legacy plain-text drafts", () => {
    const raw = buildRawEmail({ queueId: "legacy", to: "to@example.com", from: "from@example.com", subject: "Legacy", body: "Hi\n\nRegards" });
    const message = Buffer.from(raw, "base64url").toString("utf8");
    expect(message).toContain(Buffer.from("<p>Hi</p><p>Regards</p>").toString("base64"));
  });

  it("rejects subject header injection", () => {
    expect(() => buildRawEmail({ queueId: "id", to: "to@example.com", from: "from@example.com", subject: "Hi\nBcc: bad@example.com", body: "Body" })).toThrow();
  });
});
