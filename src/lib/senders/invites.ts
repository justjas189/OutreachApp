import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getInviteAvailability, hashToken, type InviteAvailability } from "@/lib/security/tokens";

export type SenderInviteConnection = {
  senderInviteId: string;
  senderAccountId: string;
  senderLabel: string;
  expiresAt: string;
  availability: InviteAvailability;
};

export async function getSenderInviteConnection(token: string): Promise<SenderInviteConnection | null> {
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(token)) return null;

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("get_sender_invite_for_connection", {
    p_token_hash: hashToken(token),
  });
  const invite = data?.[0];

  if (error || !invite?.sender_account_id) return null;

  return {
    senderInviteId: invite.sender_invite_id,
    senderAccountId: invite.sender_account_id,
    senderLabel: invite.sender_label,
    expiresAt: invite.expires_at,
    availability: getInviteAvailability(invite),
  };
}
