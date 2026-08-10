import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const actions = read("src/app/(admin)/dashboard/actions.ts");
const dashboard = read("src/app/(admin)/dashboard/page.tsx");
const quickRun = read("src/components/quick-run-panel.tsx");
const deliveryMode = read("src/components/delivery-mode-control.tsx");
const campaignPage = read("src/app/(admin)/campaigns/[id]/page.tsx");

describe("Quick Run and delivery mode UI", () => {
  it("re-authorizes actions and rechecks readiness server-side", () => {
    expect(actions.match(/await requireAdmin\(\)/g)?.length).toBe(3);
    expect(actions).toContain('supabase.rpc("get_campaign_run_readiness"');
    expect(actions).toContain('supabase.rpc("create_campaign_run"');
    expect(actions).not.toContain("processEmailQueue");
    expect(actions).not.toContain("enqueue_due_campaign_emails");
  });

  it("submits selected campaign and execution type through explicit form fields", () => {
    expect(quickRun).toContain('name="campaignId"');
    expect(quickRun).toContain('name="executionType"');
    expect(quickRun).toContain("value={selected.id}");
    expect(quickRun).not.toContain('name="scheduleMode"');
    expect(actions).toContain("parseQuickRunFormData(formData)");
  });

  it("shows specific server validation failures instead of the old generic notice", () => {
    expect(dashboard).not.toContain("Quick Run date, time, timezone, or campaign selection is invalid.");
    expect(dashboard).toContain("Campaign selection was not submitted.");
    expect(dashboard).toContain("Execution type is invalid.");
    expect(dashboard).toContain("Scheduled date and time are required.");
    expect(dashboard).toContain("Timezone was not submitted.");
    expect(dashboard).toContain("Scheduled time must be in the future.");
  });

  it("shows ready, completed, failed, paused, and needs-attention campaigns", () => {
    expect(dashboard).toContain("campaign.readiness.ready");
    expect(dashboard).toContain("blockingReasons");
    expect(dashboard).toContain("What needs attention");
    expect(quickRun).toContain("Needs attention");
    expect(quickRun).toContain("latestRunStatus");
    expect(quickRun).toContain("Open campaign");
  });

  it("uses strong Live confirmations for mode change and Quick Run", () => {
    expect(deliveryMode).toContain("Enable Live Mode?");
    expect(deliveryMode).toContain("Deployment recipient safety and suppression rules will still be enforced.");
    expect(quickRun).toContain("REAL EMAILS WILL BE SENT.");
  });

  it("shows server-authoritative recipient safety without a production-mode client control", () => {
    expect(dashboard).toContain("Recipient Safety");
    expect(dashboard).toContain("TEST ALLOWLIST");
    expect(dashboard).toContain("PRODUCTION RECIPIENTS");
    expect(dashboard).toContain("dashboard requests cannot enable production recipients");
    expect(dashboard).not.toContain('name="recipientGuardMode"');
  });

  it("keeps schedule controls responsive and top-aligned", () => {
    expect(campaignPage).toContain("sm:grid-cols-2");
    expect(campaignPage).toContain("xl:items-start");
    expect(campaignPage).toContain("xl:mt-[1.75rem]");
  });

  it("submits deliberate sender strategy, sender selection, and rerun scope", () => {
    expect(quickRun).toContain('name="senderStrategy"');
    expect(quickRun).toContain('name="senderId"');
    expect(quickRun).toContain('name="runScope"');
    expect(quickRun).toContain("Previous send history remains unchanged");
    expect(quickRun).toContain("Previously SENT recipients may be included");
  });
});
