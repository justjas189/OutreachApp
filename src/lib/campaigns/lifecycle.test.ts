import { describe, expect, it } from "vitest";

import { decideCampaignDisposition } from "./lifecycle";

describe("campaign lifecycle presentation", () => {
  it("offers hard delete only when no sent, history, or in-flight evidence exists", () => {
    expect(decideCampaignDisposition({ sentEmails: 0, historyRecords: 0, processingQueueItems: 0 })).toBe("DELETE");
  });

  it.each([
    { sentEmails: 1, historyRecords: 0, processingQueueItems: 0 },
    { sentEmails: 0, historyRecords: 1, processingQueueItems: 0 },
    { sentEmails: 0, historyRecords: 0, processingQueueItems: 1 },
  ])("shows archive when permanent deletion is unsafe: %o", (evidence) => {
    expect(decideCampaignDisposition(evidence)).toBe("ARCHIVE");
  });
});
