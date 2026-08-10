import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260810125652_sender_reinvite_and_active_pending_delete.sql"), "utf8");

describe("logical sender re-invitation migration", () => {
  it("adds one current invite and request-idempotency constraints", () => {
    expect(migration).toContain("sender_invites_one_current_per_sender_idx");
    expect(migration).toContain("sender_accounts_invite_creation_key_unique");
    expect(migration).toContain("invite_creation_key");
  });

  it("locks and reuses an existing pending sender", () => {
    expect(migration).toContain("create function public.create_or_reinvite_sender");
    expect(migration).toContain("for update");
    expect(migration).toContain("only a never-connected pending sender can be re-invited");
    expect(migration).toContain("set invalidated_at = now()");
  });

  it("removes access to legacy sender-per-invite creation", () => {
    expect(migration).toContain("revoke all on function public.create_sender_invitation");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("rejects superseded links throughout OAuth state and connection flow", () => {
    expect(migration.match(/invalidated_at is null/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("delete from private.sender_oauth_states");
  });
});
