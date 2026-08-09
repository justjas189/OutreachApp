import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Phase 7 Gmail boundary", () => {
  it("implements only draft creation and direct sending Gmail operations", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "email-queue", "gmail.ts"), "utf8");
    expect(source).toContain("gmailFor(encryptedRefreshToken).users.drafts.create");
    expect(source).toContain("gmailFor(encryptedRefreshToken).users.messages.send");
    expect(source).not.toMatch(/users\.(messages|threads)\.(list|get)|users\.watch/);
  });
});
