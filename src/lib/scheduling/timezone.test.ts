import { describe, expect, it } from "vitest";

import {
  COMMON_TIME_ZONES,
  formatForDateTimeLocal,
  formatTimeZoneLabel,
  getSupportedTimeZones,
  isValidTimeZone,
  localDateTimeToUtc,
} from "./timezone";

describe("campaign timezone conversion", () => {
  it("stores an Asia/Manila local time as the matching UTC instant", () => {
    expect(localDateTimeToUtc("2026-08-09T12:30", "Asia/Manila").toISOString()).toBe("2026-08-09T04:30:00.000Z");
  });

  it("round-trips a scheduled instant for editing", () => {
    expect(formatForDateTimeLocal("2026-08-09T04:30:00.000Z", "Asia/Manila")).toBe("2026-08-09T12:30");
  });

  it("converts UTC without an offset", () => {
    expect(localDateTimeToUtc("2026-08-09T12:30", "UTC").toISOString()).toBe("2026-08-09T12:30:00.000Z");
  });

  it("exposes common zones plus every runtime-supported IANA timezone", () => {
    const zones = getSupportedTimeZones();
    for (const zone of COMMON_TIME_ZONES) expect(zones).toContain(zone);
    for (const zone of Intl.supportedValuesOf("timeZone")) expect(zones).toContain(zone);
    expect(zones.every(isValidTimeZone)).toBe(true);
  });

  it("uses friendly labels without changing canonical values", () => {
    expect(formatTimeZoneLabel("Asia/Manila")).toBe("Manila — Asia");
    expect(formatTimeZoneLabel("UTC")).toContain("Coordinated Universal Time");
  });

  it("rejects nonexistent and ambiguous daylight-saving times", () => {
    expect(() => localDateTimeToUtc("2026-03-08T02:30", "America/Los_Angeles")).toThrow(/does not exist/);
    expect(() => localDateTimeToUtc("2026-11-01T01:30", "America/Los_Angeles")).toThrow(/ambiguous/);
  });
});
