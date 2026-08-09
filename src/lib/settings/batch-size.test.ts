import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isValidEmailBatchSize,
  resolveRuntimeEmailBatchSize,
} from "./batch-size";
import { isHighImpactLiveBatchIncrease } from "./batch-size-shared";

describe("runtime email batch size", () => {
  it.each([1, 5, 50])("accepts stored bounded integer %s", (value) => {
    expect(resolveRuntimeEmailBatchSize(value, 9)).toEqual({
      effectiveBatchSize: value,
      storedBatchSize: value,
      source: "database",
    });
  });

  it("falls back to environment value when database setting is missing", () => {
    expect(resolveRuntimeEmailBatchSize(null, 12)).toMatchObject({
      effectiveBatchSize: 12,
      source: "environment-fallback",
    });
  });

  it.each([0, -1, 1.5, Number.NaN, 51, "20"])('rejects invalid stored value "%s"', (value) => {
    expect(isValidEmailBatchSize(value)).toBe(false);
    expect(resolveRuntimeEmailBatchSize(value, 6).effectiveBatchSize).toBe(6);
  });

  it("falls back to environment value when database is unavailable", () => {
    expect(resolveRuntimeEmailBatchSize(20, 4, false)).toMatchObject({
      effectiveBatchSize: 4,
      source: "environment-fallback",
    });
  });

  it("classifies Live increases of five or more as high impact", () => {
    expect(isHighImpactLiveBatchIncrease(5, 9)).toBe(false);
    expect(isHighImpactLiveBatchIncrease(5, 10)).toBe(true);
  });
});
