import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809175106_runtime_email_batch_size.sql"),
  "utf8",
).toLowerCase();

describe("runtime email batch-size migration", () => {
  it("stores a bounded runtime value in the existing singleton", () => {
    expect(migration).toContain("add column email_batch_size integer not null default 5");
    expect(migration).toContain("check (email_batch_size between 1 and 50)");
  });

  it("reuses the authenticated admin RPC and audit architecture", () => {
    expect(migration).toContain("create function public.set_runtime_email_batch_size");
    expect(migration).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(migration).toContain("'email_batch_size'");
    expect(migration).toContain("v_previous::text");
    expect(migration).toContain("p_batch_size::text");
    expect(migration).toContain("grant execute on function public.set_runtime_email_batch_size(integer, boolean)");
  });

  it("enforces confirmation for substantial increases while stored mode is Live", () => {
    expect(migration).toContain("v_mode = 'live'");
    expect(migration).toContain("p_batch_size >= v_previous + 5");
    expect(migration).toContain("live batch-size increase requires confirmation");
  });
});
