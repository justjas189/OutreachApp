import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const legacyProductName = ["Rip", "City", "Outreach"].join(" ");

const platformFiles = [
  "src/app/layout.tsx",
  "src/components/admin-shell.tsx",
  "src/app/login/page.tsx",
  "src/app/connect/[token]/page.tsx",
  "src/lib/email-queue/mime.ts",
  "README.md",
  "docs/GOOGLE_SETUP.md",
  "docs/DEPLOYMENT.md",
  "docs/SUPABASE_SETUP.md",
  "OUTREACH_APP_SPEC.md",
  "package.json",
  "package-lock.json",
];

describe("AtlasReach branding", () => {
  it("removes old platform branding from application-level files", () => {
    for (const path of platformFiles) {
      expect(read(path), path).not.toContain(legacyProductName);
    }
  });

  it("uses AtlasReach and AR in product UI and metadata", () => {
    expect(read("src/app/layout.tsx")).toContain('default: "AtlasReach — Admin Desk"');
    expect(read("src/components/admin-shell.tsx")).toContain(">AR</span>");
    expect(read("src/components/admin-shell.tsx")).toContain(">AtlasReach</span>");
    expect(read("src/app/login/page.tsx")).toContain(">AR</span>");
    expect(read("src/app/connect/[token]/page.tsx")).toContain(">AtlasReach</p>");
  });

  it("renames package identity without changing publication content", () => {
    expect(JSON.parse(read("package.json")).name).toBe("atlasreach");
    expect(read("OUTREACH_APP_SPEC.md")).toContain("Rip City Review");
    expect(read("OUTREACH_APP_SPEC.md")).toContain("www.theripcityreview.com");
  });
});
