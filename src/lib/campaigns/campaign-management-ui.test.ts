import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const campaignsPage = readFileSync(join(process.cwd(), "src", "app", "(admin)", "campaigns", "page.tsx"), "utf8");
const detailPage = readFileSync(join(process.cwd(), "src", "app", "(admin)", "campaigns", "[id]", "page.tsx"), "utf8");
const actions = readFileSync(join(process.cwd(), "src", "app", "(admin)", "campaigns", "[id]", "actions.ts"), "utf8");

describe("campaign management UI boundaries", () => {
  it("defaults to active campaigns and provides an archived history view", () => {
    expect(campaignsPage).toContain('viewValue === "archived" ? "archived" : "active"');
    expect(campaignsPage).toContain('campaign.status !== "ARCHIVED"');
    expect(campaignsPage).toContain("Archived / History");
  });

  it("requires explicit confirmation for database-decided delete/archive", () => {
    expect(detailPage).toContain("ConfirmSubmitButton");
    expect(detailPage).toContain("Final eligibility is recalculated inside one locked database transaction");
    expect(detailPage).toContain("manageCampaignLifecycleAction");
  });

  it("protects every new mutation with the existing admin guard", () => {
    const editAction = actions.slice(actions.indexOf("export async function updateCampaignDetailsAction"));
    const lifecycleAction = actions.slice(actions.indexOf("export async function manageCampaignLifecycleAction"));
    expect(editAction.slice(0, editAction.indexOf("export async function", 30))).toContain("await requireAdmin()");
    expect(lifecycleAction.slice(0, lifecycleAction.indexOf("export async function", 30))).toContain("await requireAdmin()");
  });

  it("shows archives as read-only and keeps scheduling server-side", () => {
    expect(detailPage).toContain("Archived history · read-only");
    expect(detailPage).toContain("action={scheduleCampaignAction}");
    expect(detailPage).toContain("TimezoneSelect");
  });
});
