import { describe, expect, it } from "vitest";

import { campaignRunFormSchema, parseCampaignRunReadiness } from "./runs";

const campaignId = "019fe2aa-b0aa-78a0-a05b-f946aea5fd58";
const senderOne = "019fe2aa-b0aa-78a0-a05b-f946aea5fd59";
const senderTwo = "019fe2aa-b0aa-78a0-a05b-f946aea5fd60";

describe("campaign run input", () => {
  it("accepts exactly one sender for single strategy", () => {
    expect(campaignRunFormSchema.safeParse({ campaignId, senderStrategy: "single", senderIds: [senderOne], runScope: "all" }).success).toBe(true);
  });

  it("requires multiple unique senders for balanced strategy", () => {
    expect(campaignRunFormSchema.safeParse({ campaignId, senderStrategy: "balanced", senderIds: [senderOne, senderTwo], runScope: "failed" }).success).toBe(true);
    expect(campaignRunFormSchema.safeParse({ campaignId, senderStrategy: "balanced", senderIds: [senderOne], runScope: "all" }).success).toBe(false);
    expect(campaignRunFormSchema.safeParse({ campaignId, senderStrategy: "balanced", senderIds: [senderOne, senderOne], runScope: "all" }).success).toBe(false);
  });

  it("fails closed when run readiness payload is malformed", () => {
    expect(parseCampaignRunReadiness(null).canRunAll).toBe(false);
  });
});
