import { describe, expect, it } from "vitest";

import { getPagination } from "./pagination";

describe("getPagination", () => {
  it("uses inclusive Supabase ranges", () => {
    expect(getPagination("2", 120, 50)).toEqual({
      page: 2,
      pageCount: 3,
      from: 50,
      to: 99,
    });
  });

  it("clamps invalid and out-of-range pages", () => {
    expect(getPagination("nope", 20, 50).page).toBe(1);
    expect(getPagination("999", 120, 50).page).toBe(3);
  });

  it("keeps empty lists on page one", () => {
    expect(getPagination(undefined, 0, 50)).toEqual({
      page: 1,
      pageCount: 1,
      from: 0,
      to: 49,
    });
  });
});
