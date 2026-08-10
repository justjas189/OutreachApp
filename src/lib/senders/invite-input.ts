import { z } from "zod";

const labelSchema = z.string().trim().min(2).max(120);
const uuidSchema = z.uuid();

export type SenderInviteInput =
  | { actionType: "create"; senderLabel: string; requestKey: string }
  | { actionType: "reinvite"; senderId: string; requestKey: string };

export type SenderInviteInputResult =
  | { success: true; data: SenderInviteInput }
  | { success: false; error: string };

export function parseSenderInviteInput(formData: FormData): SenderInviteInputResult {
  const actionType = formData.get("actionType");
  const requestKey = uuidSchema.safeParse(formData.get("requestKey"));

  if (!requestKey.success) {
    return { success: false, error: "Invitation request expired. Refresh the page and try again." };
  }

  if (actionType === "create") {
    const rawLabel = formData.get("senderLabel");
    if (typeof rawLabel !== "string" || rawLabel.trim().length === 0) {
      return { success: false, error: "Sender label is required." };
    }

    const senderLabel = labelSchema.safeParse(rawLabel);
    if (!senderLabel.success) {
      return { success: false, error: "Sender label must contain 2 to 120 characters." };
    }

    return { success: true, data: { actionType, senderLabel: senderLabel.data, requestKey: requestKey.data } };
  }

  if (actionType === "reinvite") {
    const senderId = uuidSchema.safeParse(formData.get("senderId"));
    if (!senderId.success) {
      return { success: false, error: "Select a pending sender to re-invite." };
    }

    return { success: true, data: { actionType, senderId: senderId.data, requestKey: requestKey.data } };
  }

  return { success: false, error: "Choose whether to create or re-invite a sender." };
}
