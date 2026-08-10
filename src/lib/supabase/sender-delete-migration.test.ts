import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260810123046_delete_expired_pending_senders.sql"), "utf8");

describe("expired pending sender deletion migration", () => {
  it("requires admin authorization and locks the sender before deleting", () => {
    expect(migration).toContain("admin access required");
    expect(migration).toContain("for update");
    expect(migration).toContain("delete from public.sender_accounts");
  });

  it("rejects connection, credentials, and used invite history", () => {
    expect(migration).toContain("v_sender.status <> 'PENDING'");
    expect(migration).toContain("v_sender.connected_at is not null");
    expect(migration).toContain("private.sender_credentials");
    expect(migration).toContain("used_at is not null");
  });

  it("rejects every sender assignment and delivery history reference", () => {
    for (const relation of ["public.recipients", "public.email_drafts", "public.campaign_run_recipients", "public.campaign_runs", "public.email_queue", "public.send_logs"]) {
      expect(migration).toContain(relation);
    }
  });

  it("keeps privileged RPCs unavailable to anon and PUBLIC", () => {
    expect(migration).toContain("revoke all on function public.delete_expired_pending_sender(uuid)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated");
  });
});
