import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

function applicationSource(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return applicationSource(path);
      if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.endsWith(".test.ts")) return [];
      return readFileSync(path, "utf8");
    })
    .join("\n");
}

describe("Phase 6 Gmail boundary", () => {
  it("contains no Gmail draft creation or send call", () => {
    const source = applicationSource(join(process.cwd(), "src"));

    expect(source).not.toMatch(/gmail\.users\.drafts\.(create|send)/);
    expect(source).not.toMatch(/gmail\.users\.messages\.send/);
  });
});
