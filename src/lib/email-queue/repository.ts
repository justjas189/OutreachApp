import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { EmailQueueRow } from "@/types/database";

export type ClaimedQueueItem = { queue_id: string; delivery_mode: EmailQueueRow["delivery_mode"] };
export type PreparedEmail = ClaimedQueueItem & {
  recipient_email: string;
  sender_email: string;
  subject: string;
  body: string;
  encrypted_refresh_token: string;
};

export type QueueRepository = {
  enqueue(mode: EmailQueueRow["delivery_mode"]): Promise<number>;
  claim(mode: EmailQueueRow["delivery_mode"], batchSize: number, claimToken: string): Promise<ClaimedQueueItem[]>;
  prepare(queueId: string, claimToken: string): Promise<PreparedEmail | null>;
  succeed(queueId: string, claimToken: string, providerMessageId: string, gmailDraftId?: string): Promise<void>;
  fail(queueId: string, claimToken: string, error: { transient: boolean; code: string; message: string }): Promise<void>;
  completeCampaigns(): Promise<number>;
};

function databaseFailure(operation: string): Error {
  return new Error(`Database queue ${operation} failed.`);
}

export function createQueueRepository(): QueueRepository {
  const supabase = createSupabaseServiceClient();
  return {
    async enqueue(mode) {
      const { data, error } = await supabase.rpc("enqueue_due_campaign_emails", { p_delivery_mode: mode });
      if (error) throw databaseFailure("enqueue");
      return data ?? 0;
    },
    async claim(mode, batchSize, claimToken) {
      const { data, error } = await supabase.rpc("claim_email_queue", {
        p_delivery_mode: mode,
        p_batch_size: batchSize,
        p_claim_token: claimToken,
      });
      if (error) throw databaseFailure("claim");
      return data ?? [];
    },
    async prepare(queueId, claimToken) {
      const { data, error } = await supabase.rpc("prepare_claimed_email", {
        p_queue_id: queueId,
        p_claim_token: claimToken,
      });
      if (error) throw databaseFailure("prepare");
      return data?.[0] ?? null;
    },
    async succeed(queueId, claimToken, providerMessageId, gmailDraftId) {
      const { data, error } = await supabase.rpc("complete_email_queue_success", {
        p_queue_id: queueId,
        p_claim_token: claimToken,
        p_provider_message_id: providerMessageId,
        p_gmail_draft_id: gmailDraftId ?? null,
      });
      if (error || !data) throw databaseFailure("success finalization");
    },
    async fail(queueId, claimToken, queueError) {
      const { error } = await supabase.rpc("complete_email_queue_failure", {
        p_queue_id: queueId,
        p_claim_token: claimToken,
        p_transient: queueError.transient,
        p_error_code: queueError.code,
        p_error_message: queueError.message,
      });
      if (error) throw databaseFailure("failure finalization");
    },
    async completeCampaigns() {
      const { data, error } = await supabase.rpc("complete_finished_campaigns", {});
      if (error) throw databaseFailure("campaign completion");
      return data ?? 0;
    },
  };
}
