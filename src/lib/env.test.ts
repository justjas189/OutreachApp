import { describe, expect, it } from "vitest";

import { parseEmailMode } from "./env";

describe("parseEmailMode", () => {
  it("defaults missing or invalid values to preview", () => {
    expect(parseEmailMode(undefined)).toBe("preview");
    expect(parseEmailMode("LIVE")).toBe("preview");
  });

  it.each(["preview", "draft", "live"] as const)("accepts %s", (mode) => {
    expect(parseEmailMode(mode)).toBe(mode);
  });
});
