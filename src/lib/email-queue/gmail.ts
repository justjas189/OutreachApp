import "server-only";

import { google } from "googleapis";

import { createGoogleOAuthClient } from "@/lib/google-oauth/client";
import { decryptSecret } from "@/lib/security/encryption";

export type GmailResult = { providerMessageId: string; gmailDraftId?: string };

export type GmailGateway = {
  createDraft(input: { raw: string; encryptedRefreshToken: string }): Promise<GmailResult>;
  sendMessage(input: { raw: string; encryptedRefreshToken: string }): Promise<GmailResult>;
};

function gmailFor(encryptedRefreshToken: string) {
  const oauth = createGoogleOAuthClient();
  oauth.setCredentials({ refresh_token: decryptSecret(encryptedRefreshToken) });
  return google.gmail({ version: "v1", auth: oauth });
}

export const gmailGateway: GmailGateway = {
  async createDraft({ raw, encryptedRefreshToken }) {
    const response = await gmailFor(encryptedRefreshToken).users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
      fields: "id,message/id",
    });
    const draftId = response.data.id;
    if (!draftId) throw new Error("Gmail did not return a draft identifier.");
    return { providerMessageId: response.data.message?.id ?? draftId, gmailDraftId: draftId };
  },
  async sendMessage({ raw, encryptedRefreshToken }) {
    const response = await gmailFor(encryptedRefreshToken).users.messages.send({
      userId: "me",
      requestBody: { raw },
      fields: "id",
    });
    if (!response.data.id) throw new Error("Gmail did not return a message identifier.");
    return { providerMessageId: response.data.id };
  },
};
