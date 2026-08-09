import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809160316_runtime_delivery_mode_and_quick_run.sql"),
  "utf8",
).toLowerCase();

describe("runtime delivery mode and Quick Run migration", () => {
  it("stores preview-first mode and append-only audit history", () => {
    expect(migration).toContain("create table public.application_settings");
    expect(migration).toContain("delivery_mode public.runtime_email_mode not null default 'preview'");
    expect(migration).toContain("create table public.application_setting_audit");
    expect(migration).toContain("previous_value");
    expect(migration).toContain("new_value");
    expect(migration).toContain("changed_by");
    expect(migration).toContain("changed_at");
  });

  it("allows admin reads but keeps setting writes behind the audited RPC", () => {
    expect(migration).toContain("alter table public.application_settings enable row level security");
    expect(migration).toContain("admins view application settings");
    expect(migration).toContain("revoke all on table public.application_settings");
    expect(migration).not.toContain("grant update on table public.application_settings to authenticated");
    expect(migration).toContain("grant execute on function public.set_runtime_email_mode(public.runtime_email_mode) to authenticated");
  });

  it("authorizes mode changes and readiness from immutable app metadata", () => {
    expect(migration.match(/auth\.jwt\(\) -> 'app_metadata' ->> 'role'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).not.toContain("user_metadata");
  });

  it("reuses readiness for scheduling and existing queue enqueue", () => {
    expect(migration).toContain("v_readiness := public.get_campaign_readiness(p_campaign_id)");
    expect(migration).toContain("private.get_campaign_readiness(campaign.id)");
    expect(migration).toContain("on conflict (email_draft_id) do nothing");
    expect(migration).toContain("campaign.paused_at is null");
    expect(migration).toContain("not exists (select 1 from public.suppression_list");
  });
});
