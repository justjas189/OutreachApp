import { z } from "zod";

import { plainTextToHtml, sanitizeRichHtml } from "@/lib/templates/rich-text";

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
  bodyHtml?: string | null;
}): string {
  const to = headerEmail.parse(input.to.trim().toLowerCase());
  const from = headerEmail.parse(input.from.trim().toLowerCase());
  if (!input.subject.trim() || /[\x00-\x1F\x7F]/.test(input.subject)) throw new Error("Email subject is invalid.");
  const textBody = Buffer.from(input.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  const htmlContent = sanitizeRichHtml(input.bodyHtml ?? plainTextToHtml(input.body));
  const htmlBody = Buffer.from(htmlContent, "utf8").toString("base64");
  const boundary = `atlasreach-alt-${input.queueId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodedHeader(input.subject.trim())}`,
    `Message-ID: <${input.queueId}@atlasreach.invalid>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    textBody,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    htmlBody,
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
