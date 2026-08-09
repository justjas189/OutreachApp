export type CampaignDisposition = "DELETE" | "ARCHIVE";

export type CampaignLifecycleEvidence = {
  sentEmails: number;
  historyRecords: number;
  processingQueueItems?: number;
};

export function decideCampaignDisposition(evidence: CampaignLifecycleEvidence): CampaignDisposition {
  return evidence.sentEmails > 0
    || evidence.historyRecords > 0
    || (evidence.processingQueueItems ?? 0) > 0
    ? "ARCHIVE"
    : "DELETE";
}
