import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const control = read("src/components/batch-size-control.tsx");
const actions = read("src/app/(admin)/dashboard/actions.ts");
const quickRun = read("src/components/quick-run-panel.tsx");

describe("runtime batch-size UI", () => {
  it("provides client bounds plus server authorization and validation", () => {
    expect(control).toContain("EMAIL_BATCH_SIZE_MIN");
    expect(control).toContain("EMAIL_BATCH_SIZE_MAX");
    expect(control).toContain('step="1"');
    expect(actions).toContain("export async function setEmailBatchSizeAction");
    expect(actions).toContain("await requireAdmin()");
    expect(actions).toContain("batchSizeSchema.safeParse");
  });

  it("requires a strong high-impact Live confirmation", () => {
    expect(control).toContain("Increase Live batch size to");
    expect(control).toContain("per connected sender");
    expect(control).toContain("Provider limits and all queue safety checks still apply.");
    expect(control).toContain("isHighImpactLiveBatchIncrease");
  });

  it("shows active batch size in Quick Run confirmation and summary", () => {
    expect(quickRun).toContain("Batch size: ${batchSize} per sender");
    expect(quickRun).toContain("Batch size: {batchSize} per connected sender per worker execution.");
  });
});
