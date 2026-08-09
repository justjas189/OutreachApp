import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase seed", () => {
  it("targets the normalized template uniqueness index", () => {
    const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");

    expect(seed).toContain("on conflict (lower(btrim(business_type))) do nothing");
  });
});
