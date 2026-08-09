import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isModeAllowedByDeployment,
  resolveRuntimeDeliveryMode,
} from "./delivery-mode";

describe("runtime delivery mode", () => {
  it.each(["preview", "draft", "live"] as const)("uses stored %s mode under a live deployment ceiling", (mode) => {
    expect(resolveRuntimeDeliveryMode(mode, "live").effectiveMode).toBe(mode);
  });

  it("uses EMAIL_MODE as fallback when the database row is missing", () => {
    expect(resolveRuntimeDeliveryMode(null, "draft")).toMatchObject({
      effectiveMode: "draft",
      source: "deployment-fallback",
    });
  });

  it("fails closed to preview for invalid database configuration", () => {
    expect(resolveRuntimeDeliveryMode("LIVE", "live")).toMatchObject({
      effectiveMode: "preview",
      source: "fail-closed",
    });
  });

  it("fails closed to preview when authoritative database lookup fails", () => {
    expect(resolveRuntimeDeliveryMode(null, "live", false)).toMatchObject({
      effectiveMode: "preview",
      source: "fail-closed",
    });
  });

  it("never exceeds the deployment ceiling", () => {
    expect(resolveRuntimeDeliveryMode("live", "draft")).toMatchObject({
      effectiveMode: "draft",
      constrainedByDeployment: true,
    });
    expect(isModeAllowedByDeployment("draft", "preview")).toBe(false);
    expect(isModeAllowedByDeployment("preview", "preview")).toBe(true);
  });
});
