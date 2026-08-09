import { describe, expect, it } from "vitest";

import { formatForDateTimeLocal, localDateTimeToUtc } from "./timezone";

describe("campaign timezone conversion", () => {
  it("stores an Asia/Manila local time as the matching UTC instant", () => {
    expect(localDateTimeToUtc("2026-08-09T12:30", "Asia/Manila").toISOString()).toBe("2026-08-09T04:30:00.000Z");
  });

  it("round-trips a scheduled instant for editing", () => {
    expect(formatForDateTimeLocal("2026-08-09T04:30:00.000Z", "Asia/Manila")).toBe("2026-08-09T12:30");
  });

  it("rejects nonexistent and ambiguous daylight-saving times", () => {
    expect(() => localDateTimeToUtc("2026-03-08T02:30", "America/Los_Angeles")).toThrow(/does not exist/);
    expect(() => localDateTimeToUtc("2026-11-01T01:30", "America/Los_Angeles")).toThrow(/ambiguous/);
  });
});
