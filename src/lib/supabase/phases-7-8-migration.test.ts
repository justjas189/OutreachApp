import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20260809090305_phases_7_8.sql"), "utf8").toLowerCase();

describe("Phase 7–8 migration", () => {
  it("prevents duplicate enqueue and atomically claims rows", () => {
    expect(migration).toContain("email_draft_id uuid not null unique");
    expect(migration).toContain("for update of queue skip locked");
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain("claim_token = p_claim_token");
  });

  it("requires due, active, unpaused, approved queue work", () => {
    expect(migration).toContain("campaign.scheduled_at <= now()");
    expect(migration).toContain("campaign.paused_at is null");
    expect(migration).toContain("draft.status = 'approved'");
    expect(migration).toContain("recipient.status = 'approved'");
  });

  it("rechecks suppression immediately before Gmail work", () => {
    expect(migration).toContain("create function public.prepare_claimed_email");
    expect(migration).toContain("exists (select 1 from public.suppression_list where email = v_recipient.email)");
    expect(migration).toContain("set status = 'cancelled'");
  });

  it("caps retries and protects worker RPCs", () => {
    expect(migration).toContain("queue.attempts < queue.max_attempts");
    expect(migration).toContain("max_attempts integer not null default 5");
    expect(migration).toContain("grant execute on function public.claim_email_queue(public.email_delivery_mode, integer, uuid) to service_role");
    expect(migration).not.toContain("grant execute on function public.claim_email_queue(public.email_delivery_mode, integer, uuid) to authenticated");
  });
});
