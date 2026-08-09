import { describe, expect, it } from "vitest";

import {
  parseQuickRunFormData,
  QuickRunInputError,
  resolveQuickRunSchedule,
} from "./quick-run-input";

const campaignId = "00000000-0000-4000-8000-000000000001";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function expectInputError(entries: Record<string, string>, code: QuickRunInputError["code"]) {
  try {
    parseQuickRunFormData(formData(entries));
    throw new Error("Expected Quick Run input to be rejected.");
  } catch (error) {
    expect(error).toBeInstanceOf(QuickRunInputError);
    expect((error as QuickRunInputError).code).toBe(code);
  }
}

describe("Quick Run input contract", () => {
  it("accepts Run Now with only campaignId and executionType", () => {
    expect(parseQuickRunFormData(formData({ campaignId, executionType: "now" }))).toEqual({
      campaignId,
      executionType: "now",
    });
  });

  it("uses current server time and does not parse schedule fields for Run Now", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(resolveQuickRunSchedule({ campaignId, executionType: "now" }, now)).toEqual({
      scheduledAt: now,
      scheduleTimezone: "UTC",
    });
  });

  it("returns clear errors for missing campaign and invalid execution type", () => {
    expectInputError({ executionType: "now" }, "campaign-missing");
    expectInputError({ campaignId, executionType: "NOW" }, "execution-type-invalid");
  });

  it("requires date/time and timezone only for scheduled execution", () => {
    expectInputError({ campaignId, executionType: "schedule", timezone: "Asia/Manila" }, "datetime-required");
    expectInputError({ campaignId, executionType: "schedule", localDateTime: "2026-08-11T20:00" }, "timezone-missing");
  });

  it("accepts a future Asia/Manila schedule and converts it to UTC", () => {
    const input = parseQuickRunFormData(formData({
      campaignId,
      executionType: "schedule",
      localDateTime: "2026-08-11T20:00",
      timezone: "Asia/Manila",
    }));
    expect(resolveQuickRunSchedule(input, new Date("2026-08-10T12:00:00.000Z"))).toEqual({
      scheduledAt: new Date("2026-08-11T12:00:00.000Z"),
      scheduleTimezone: "Asia/Manila",
    });
  });

  it("rejects invalid timezones and past schedules distinctly", () => {
    expectInputError({
      campaignId,
      executionType: "schedule",
      localDateTime: "2026-08-11T20:00",
      timezone: "Not/AZone",
    }, "timezone-invalid");

    const input = parseQuickRunFormData(formData({
      campaignId,
      executionType: "schedule",
      localDateTime: "2026-08-09T20:00",
      timezone: "Asia/Manila",
    }));
    expect(() => resolveQuickRunSchedule(input, new Date("2026-08-10T12:00:00.000Z"))).toThrowError(
      expect.objectContaining({ code: "scheduled-time-past" }),
    );
  });
});
