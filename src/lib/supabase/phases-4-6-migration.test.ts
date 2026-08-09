import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809014839_phases_4_6.sql"),
  "utf8",
).toLowerCase();

describe("Phase 4–6 migration security and workflow", () => {
  it("stores OAuth state and credentials only in the private schema", () => {
    expect(migration).toContain("create table private.sender_oauth_states");
    expect(migration).toContain("alter table private.sender_oauth_states enable row level security");
    expect(migration).toContain("revoke all on table private.sender_oauth_states from public, anon, authenticated");
    expect(migration).not.toContain("create table public.sender_oauth_states");
  });

  it("keeps connection RPCs service-role-only", () => {
    for (const signature of [
      "public.get_sender_invite_for_connection(text)",
      "public.begin_sender_oauth(text, text, text, timestamptz)",
      "public.consume_sender_oauth_state(text)",
      "public.complete_sender_connection(uuid, text, text, text)",
    ]) {
      expect(migration).toContain(`grant execute on function ${signature}\nto service_role`);
    }
  });

  it("consumes OAuth state and sender invitations only once", () => {
    expect(migration).toContain("oauth_state.used_at is null");
    expect(migration).toContain("set used_at = now()");
    expect(migration).toContain("v_invite.used_at is not null");
  });

  it("enforces connected-only balanced assignment in the database", () => {
    expect(migration).toContain("and status = 'connected'");
    expect(migration).toContain("position % v_sender_count");
    expect(migration).toContain("sender assignment is locked after preview generation");
  });

  it("implements generated to approved transitions without Gmail operations", () => {
    expect(migration).toContain("create function public.store_generated_email_previews");
    expect(migration).toContain("create function public.approve_email_preview");
    expect(migration).toContain("set status = 'approved'");
    expect(migration).not.toContain("gmail.googleapis.com");
  });
});
