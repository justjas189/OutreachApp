import { describe, expect, it } from "vitest";

import { resolveScheduleDate, scheduleInputSchema } from "./schedule-input";

describe("shared schedule input", () => {
  it("uses server time for send now", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(resolveScheduleDate({ scheduleMode: "now", campaignId: "00000000-0000-4000-8000-000000000001", timezone: "UTC" }, now)).toEqual(now);
  });

  it("converts a future local Manila time to UTC", () => {
    const parsed = scheduleInputSchema.parse({
      scheduleMode: "later",
      campaignId: "00000000-0000-4000-8000-000000000001",
      timezone: "Asia/Manila",
      localDateTime: "2026-08-11T20:00",
    });
    expect(resolveScheduleDate(parsed, new Date("2026-08-10T12:00:00.000Z")).toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });

  it("rejects past or invalid timezone schedules", () => {
    expect(() => resolveScheduleDate({
      scheduleMode: "later",
      campaignId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      localDateTime: "2026-08-09T20:00",
    }, new Date("2026-08-10T12:00:00.000Z"))).toThrow("future");
    expect(scheduleInputSchema.safeParse({
      scheduleMode: "now",
      campaignId: "00000000-0000-4000-8000-000000000001",
      timezone: "Not/AZone",
    }).success).toBe(false);
  });
});
