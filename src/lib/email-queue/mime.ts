import { z } from "zod";

const headerEmail = z.email();

function encodedHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function buildRawEmail(input: {
  queueId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
}): string {
  const to = headerEmail.parse(input.to.trim().toLowerCase());
  const from = headerEmail.parse(input.from.trim().toLowerCase());
  if (!input.subject.trim() || /[\x00-\x1F\x7F]/.test(input.subject)) throw new Error("Email subject is invalid.");
  const body = Buffer.from(input.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodedHeader(input.subject.trim())}`,
    `Message-ID: <${input.queueId}@rip-city-outreach.invalid>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
