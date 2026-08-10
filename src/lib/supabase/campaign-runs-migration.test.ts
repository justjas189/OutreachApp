import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260810104429_campaign_runs_sender_strategies.sql"), "utf8");

describe("campaign runs migration", () => {
  it("adds immutable run headers and recipient snapshots with RLS", () => {
    expect(migration).toContain("create table public.campaign_runs");
    expect(migration).toContain("create table public.campaign_run_recipients");
    expect(migration).toContain("alter table public.campaign_runs enable row level security");
    expect(migration).toContain("campaign_runs_one_active_idx");
  });

  it("creates locked admin runs and validates private sender credentials", () => {
    expect(migration).toContain("create function public.create_campaign_run");
    expect(migration).toContain("for update");
    expect(migration).toContain("join private.sender_credentials");
    expect(migration).toContain("campaign already has an active run");
  });

  it("preserves failed history and creates fresh queue records", () => {
    expect(migration).toContain("retry_of_run_id");
    expect(migration).toContain("campaign_run_recipient_id");
    expect(migration).toContain("email_queue_run_recipient_unique");
    expect(migration).not.toContain("delete from public.send_logs");
  });

  it("blocks latest terminal allowlist failure until deployment guard changes", () => {
    expect(migration).toContain("newer_run.run_number > previous_run.run_number");
    expect(migration).toContain("previous.last_error_code,'') = 'recipient_not_allowlisted'");
    expect(migration).toContain("p_recipient_guard_mode = 'allowlist'");
  });
});
