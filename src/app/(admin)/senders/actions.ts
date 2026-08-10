"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { getAppUrl } from "@/lib/env";
import { generateSecureToken, hashToken, SENDER_INVITE_TTL_MS } from "@/lib/security/tokens";
import { parseSenderInviteInput } from "@/lib/senders/invite-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type InviteActionState, initialInviteActionState } from "./action-state";

const labelSchema = z.string().trim().min(2).max(120);
const senderIdSchema = z.uuid();

export async function createSenderInviteAction(
  _previousState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  await requireAdmin();
  const input = parseSenderInviteInput(formData);
  if (!input.success) return { ...initialInviteActionState, error: input.error };

  const rawToken = generateSecureToken();
  const expiresAt = new Date(Date.now() + SENDER_INVITE_TTL_MS).toISOString();
  const supabase = await createSupabaseServerClient();
  let senderLabel: string;

  if (input.data.actionType === "reinvite") {
    const { data: sender, error: senderError } = await supabase
      .from("sender_accounts")
      .select("display_name,status")
      .eq("id", input.data.senderId)
      .maybeSingle();

    if (senderError || !sender || sender.status !== "PENDING") {
      return { ...initialInviteActionState, error: "This sender is not eligible for re-invite." };
    }
    senderLabel = sender.display_name;
  } else {
    senderLabel = input.data.senderLabel;
  }

  const { error } = await supabase.rpc("create_or_reinvite_sender", {
    p_sender_label: senderLabel,
    p_token_hash: hashToken(rawToken),
    p_expires_at: expiresAt,
    p_request_key: input.data.requestKey,
    p_sender_account_id: input.data.actionType === "reinvite" ? input.data.senderId : null,
  });

  if (error) {
    return {
      ...initialInviteActionState,
      error: input.data.actionType === "reinvite"
        ? "This sender is not eligible for re-invite."
        : "Sender invitation could not be created.",
    };
  }

  revalidatePath("/senders");
  return {
    error: null,
    inviteUrl: `${getAppUrl()}/connect/${rawToken}`,
    expiresAt,
    nextRequestKey: randomUUID(),
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
