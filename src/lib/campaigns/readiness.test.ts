import { describe, expect, it } from "vitest";

import { parseCampaignReadiness, readinessAction } from "./readiness";

const readyValue = {
  ready: true,
  blockingReasons: [],
  recipientCount: 53,
  eligibleCount: 52,
  generatedCount: 52,
  approvedCount: 52,
  suppressedCount: 1,
  connectedSenderCount: 4,
  scheduledAt: null,
  scheduleTimezone: null,
};

describe("campaign readiness", () => {
  it("accepts an authoritative ready summary", () => {
    expect(parseCampaignReadiness(readyValue)).toEqual(readyValue);
  });

  it("fails closed when a readiness response is invalid", () => {
    expect(parseCampaignReadiness({ ready: true })).toMatchObject({
      ready: false,
      blockingReasons: ["Campaign readiness could not be verified"],
    });
  });

  it("maps common blockers to useful repair actions", () => {
    expect(readinessAction("No connected senders")).toEqual({ href: "/senders", label: "Manage senders" });
    expect(readinessAction("Missing template for Florists")).toEqual({ href: "/templates", label: "Manage templates" });
    expect(readinessAction("12 emails still need approval")).toEqual({ href: "emails", label: "Review emails" });
    expect(readinessAction("Campaign is paused")).toBeNull();
  });
});
