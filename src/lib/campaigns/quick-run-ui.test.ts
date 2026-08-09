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
    expect(actions.match(/await requireAdmin\(\)/g)?.length).toBe(2);
    expect(actions).toContain('supabase.rpc("get_campaign_readiness"');
    expect(actions).toContain('supabase.rpc("schedule_campaign"');
    expect(actions).not.toContain("processEmailQueue");
    expect(actions).not.toContain("enqueue_due_campaign_emails");
  });

  it("only passes ready campaigns into Quick Run and explains blockers", () => {
    expect(dashboard).toContain("campaign.readiness.ready");
    expect(dashboard).toContain("blockingReasons");
    expect(dashboard).toContain("What needs attention");
  });

  it("uses strong Live confirmations for mode change and Quick Run", () => {
    expect(deliveryMode).toContain("Enable Live Mode?");
    expect(deliveryMode).toContain("TEST_RECIPIENT_ALLOWLIST and suppression rules will still be enforced.");
    expect(quickRun).toContain("REAL EMAILS WILL BE SENT.");
  });

  it("keeps schedule controls responsive and top-aligned", () => {
    expect(campaignPage).toContain("sm:grid-cols-2");
    expect(campaignPage).toContain("xl:items-start");
    expect(campaignPage).toContain("xl:mt-[1.75rem]");
  });
});
