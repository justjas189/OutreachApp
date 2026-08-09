import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809133035_phases_9_10_hardening.sql"),
  "utf8",
).toLowerCase();

describe("Phase 9–10 hardening migration", () => {
  it("makes the database decide delete versus archive under a row lock", () => {
    expect(migration).toContain("create function public.manage_campaign_lifecycle");
    expect(migration).toContain("where id = p_campaign_id\n  for update");
    expect(migration).toContain("exists (select 1 from public.send_logs");
    expect(migration).toContain("return 'deleted'");
    expect(migration).toContain("return 'archived'");
  });

  it("preserves history and cancels unsent work on archive", () => {
    expect(migration).toContain("set status = 'cancelled'");
    expect(migration).toContain("set status = 'archived', archived_at = now()");
    expect(migration).not.toContain("delete from public.send_logs");
  });

  it("protects archive state from direct mutation and hard deletion", () => {
    expect(migration).toContain("create trigger campaigns_enforce_lifecycle");
    expect(migration).toContain("archived campaigns are read-only");
    expect(migration).toContain("campaign history cannot be permanently deleted");
  });

  it("keeps deleted and archived campaigns outside worker eligibility", () => {
    expect(migration).toContain("where status = 'ready' and archived_at is null and scheduled_at <= now()");
    expect(migration).toContain("campaign.status = 'archived' or v_campaign.archived_at is not null");
    expect(migration).toContain("campaign.scheduled_at <= now()");
  });

  it("restricts destructive RPC execution to authenticated callers with an admin claim", () => {
    expect(migration).toContain("admin access required");
    expect(migration).toContain("revoke all on function public.manage_campaign_lifecycle(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.manage_campaign_lifecycle(uuid) to authenticated");
  });
});
