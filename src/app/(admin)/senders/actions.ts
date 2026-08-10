"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { getAppUrl } from "@/lib/env";
import { generateSecureToken, hashToken, SENDER_INVITE_TTL_MS } from "@/lib/security/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type InviteActionState, initialInviteActionState } from "./action-state";

const labelSchema = z.string().trim().min(2).max(120);
const senderIdSchema = z.uuid();

export async function createSenderInviteAction(
  _previousState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  await requireAdmin();
  const label = labelSchema.safeParse(formData.get("senderLabel"));
  if (!label.success) {
    return { ...initialInviteActionState, error: "Sender label must contain 2 to 120 characters." };
  }

  const rawToken = generateSecureToken();
  const expiresAt = new Date(Date.now() + SENDER_INVITE_TTL_MS).toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_sender_invitation", {
    p_sender_label: label.data,
    p_token_hash: hashToken(rawToken),
    p_expires_at: expiresAt,
  });

  if (error) {
    return { ...initialInviteActionState, error: "Sender invitation could not be created." };
  }

  revalidatePath("/senders");
  return {
    error: null,
    inviteUrl: `${getAppUrl()}/connect/${rawToken}`,
    expiresAt,
  };
}

export async function renameSenderAction(formData: FormData) {
  await requireAdmin();
  const senderId = senderIdSchema.safeParse(formData.get("senderId"));
  const label = labelSchema.safeParse(formData.get("senderLabel"));
  if (!senderId.success || !label.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("sender_accounts").update({ display_name: label.data }).eq("id", senderId.data);
  revalidatePath("/senders");
}

export async function revokeSenderAction(formData: FormData) {
  await requireAdmin();
  const senderId = senderIdSchema.safeParse(formData.get("senderId"));
  if (!senderId.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("revoke_sender_connection", { p_sender_account_id: senderId.data });
  revalidatePath("/senders");
  revalidatePath("/campaigns");
}

export async function deleteExpiredPendingSenderAction(formData: FormData) {
  await requireAdmin();
  const senderId = senderIdSchema.safeParse(formData.get("senderId"));
  if (!senderId.success) redirect("/senders?notice=delete-invalid");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_expired_pending_sender", {
    p_sender_account_id: senderId.data,
  });

  revalidatePath("/senders");
  redirect(`/senders?notice=${error || !data ? "delete-blocked" : "deleted"}`);
}
