import { describe, expect, it } from "vitest";

import { distributeEvenly } from "./distribution";

describe("balanced sender distribution", () => {
  it("distributes recipients evenly in stable round-robin order", () => {
    const assignments = distributeEvenly(Array.from({ length: 10 }, (_, index) => index), ["a", "b", "c"]);
    const counts = assignments.reduce<Record<string, number>>((result, assignment) => {
      result[assignment.sender] = (result[assignment.sender] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({ a: 4, b: 3, c: 3 });
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1);
  });

  it("refuses assignment without a connected sender", () => {
    expect(() => distributeEvenly([1], [])).toThrow("connected sender");
  });
});
