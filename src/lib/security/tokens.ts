import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SENDER_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function secureStringsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export type InviteAvailability = "AVAILABLE" | "EXPIRED" | "USED";

export function getInviteAvailability(
  invite: { expires_at: string; used_at: string | null },
  now = new Date(),
): InviteAvailability {
  if (invite.used_at) return "USED";
  return new Date(invite.expires_at).getTime() > now.getTime() ? "AVAILABLE" : "EXPIRED";
}
