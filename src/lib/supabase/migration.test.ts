import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260808185427_initial_outreach_schema.sql",
  ),
  "utf8",
).toLowerCase();

describe("initial Supabase migration security", () => {
  it.each([
    "profiles",
    "sender_accounts",
    "sender_invites",
    "campaigns",
    "recipients",
    "templates",
    "email_drafts",
    "suppression_list",
    "send_logs",
  ])("enables RLS on public.%s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it("authorizes from immutable app_metadata rather than user_metadata", () => {
    expect(migration).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(migration).not.toContain("auth.jwt() -> 'user_metadata'");
  });

  it("keeps OAuth and invite secrets outside the exposed public schema", () => {
    expect(migration).toContain("create table private.sender_credentials");
    expect(migration).toContain("create table private.sender_invite_tokens");
    expect(migration).toContain("revoke all on schema private from public, anon, authenticated");
  });

  it("enforces campaign-local recipient uniqueness in the database", () => {
    expect(migration).toContain("unique (campaign_id, email)");
  });

  it("uses a security-invoker transaction function for campaign imports", () => {
    expect(migration).toContain("create function public.create_campaign_with_recipients");
    expect(migration).toContain("security invoker");
  });
});
