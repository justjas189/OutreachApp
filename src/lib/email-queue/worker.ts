import "server-only";

import { randomUUID } from "node:crypto";

import {
  getEmailBatchSize,
  getTestRecipientAllowlist,
  type EmailMode,
} from "@/lib/env";
import { getRuntimeDeliveryMode } from "@/lib/settings/delivery-mode";

import { classifyGmailError } from "./errors";
import { gmailGateway, type GmailGateway } from "./gmail";
import { buildRawEmail } from "./mime";
import { createQueueRepository, type QueueRepository } from "./repository";

export type QueueRunResult = {
  mode: EmailMode;
  enqueued: number;
  claimed: number;
  completed: number;
  retriedOrFailed: number;
  skipped: number;
  campaignsCompleted: number;
};

type WorkerOptions = {
  mode?: EmailMode;
  batchSize?: number;
  allowlist?: Set<string> | null;
  repository?: QueueRepository;
  gmail?: GmailGateway;
};

export async function processEmailQueue(options: WorkerOptions = {}): Promise<QueueRunResult> {
  const mode = options.mode ?? await getRuntimeDeliveryMode();
  const result: QueueRunResult = {
    mode,
    enqueued: 0,
    claimed: 0,
    completed: 0,
    retriedOrFailed: 0,
    skipped: 0,
    campaignsCompleted: 0,
  };
  if (mode === "preview") return result;

  const repository = options.repository ?? createQueueRepository();
  const gmail = options.gmail ?? gmailGateway;
  const batchSize = options.batchSize ?? getEmailBatchSize();
  const allowlist = options.allowlist === undefined ? getTestRecipientAllowlist() : options.allowlist;
  result.enqueued = await repository.enqueue(mode);
  const claimToken = randomUUID();
  const claims = await repository.claim(mode, batchSize, claimToken);
  result.claimed = claims.length;

  for (const claim of claims) {
    const prepared = await repository.prepare(claim.queue_id, claimToken);
    if (!prepared) {
      result.skipped += 1;
      continue;
    }
    if (allowlist && !allowlist.has(prepared.recipient_email.toLowerCase())) {
      await repository.fail(claim.queue_id, claimToken, {
        transient: false,
        code: "recipient_not_allowlisted",
        message: "Recipient is not included in TEST_RECIPIENT_ALLOWLIST.",
      });
      result.retriedOrFailed += 1;
      continue;
    }

    let gmailResult;
    try {
      const raw = buildRawEmail({
        queueId: claim.queue_id,
        to: prepared.recipient_email,
        from: prepared.sender_email,
        subject: prepared.subject,
        body: prepared.body,
      });
      const operation = prepared.delivery_mode === "draft" ? gmail.createDraft : gmail.sendMessage;
      gmailResult = await operation({ raw, encryptedRefreshToken: prepared.encrypted_refresh_token });
    } catch (error) {
      await repository.fail(claim.queue_id, claimToken, classifyGmailError(error));
      result.retriedOrFailed += 1;
      continue;
    }
    await repository.succeed(
      claim.queue_id,
      claimToken,
      gmailResult.providerMessageId,
      gmailResult.gmailDraftId,
    );
    result.completed += 1;
  }
  result.campaignsCompleted = await repository.completeCampaigns();
  return result;
}
