import "server-only";

import { getEmailMode, type EmailMode } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const modeRank: Record<EmailMode, number> = {
  preview: 0,
  draft: 1,
  live: 2,
};

export type RuntimeDeliveryModeState = {
  effectiveMode: EmailMode;
  storedMode: EmailMode | null;
  deploymentMode: EmailMode;
  constrainedByDeployment: boolean;
  source: "database" | "deployment-fallback" | "fail-closed";
  updatedAt: string | null;
  updatedBy: string | null;
};

export function isEmailMode(value: unknown): value is EmailMode {
  return value === "preview" || value === "draft" || value === "live";
}

export function isModeAllowedByDeployment(mode: EmailMode, deploymentMode: EmailMode): boolean {
  return modeRank[mode] <= modeRank[deploymentMode];
}

export function resolveRuntimeDeliveryMode(
  storedMode: unknown,
  deploymentMode: EmailMode,
  databaseAvailable = true,
): Pick<RuntimeDeliveryModeState, "effectiveMode" | "storedMode" | "constrainedByDeployment" | "source"> {
  if (!databaseAvailable) {
    return {
      effectiveMode: "preview",
      storedMode: null,
      constrainedByDeployment: deploymentMode !== "preview",
      source: "fail-closed",
    };
  }

  if (storedMode === null || storedMode === undefined) {
    return {
      effectiveMode: deploymentMode,
      storedMode: null,
      constrainedByDeployment: false,
      source: "deployment-fallback",
    };
  }

  if (!isEmailMode(storedMode)) {
    return {
      effectiveMode: "preview",
      storedMode: null,
      constrainedByDeployment: deploymentMode !== "preview",
      source: "fail-closed",
    };
  }

  const constrainedByDeployment = !isModeAllowedByDeployment(storedMode, deploymentMode);
  return {
    effectiveMode: constrainedByDeployment ? deploymentMode : storedMode,
    storedMode,
    constrainedByDeployment,
    source: "database",
  };
}

export async function getRuntimeDeliveryModeState(): Promise<RuntimeDeliveryModeState> {
  const deploymentMode = getEmailMode();
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("application_settings")
      .select("delivery_mode,updated_at,updated_by")
      .eq("singleton", true)
      .maybeSingle();

    if (error) {
      const resolved = resolveRuntimeDeliveryMode(null, deploymentMode, false);
      return { ...resolved, deploymentMode, updatedAt: null, updatedBy: null };
    }

    const resolved = resolveRuntimeDeliveryMode(data?.delivery_mode ?? null, deploymentMode);
    return {
      ...resolved,
      deploymentMode,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
    };
  } catch {
    const resolved = resolveRuntimeDeliveryMode(null, deploymentMode, false);
    return { ...resolved, deploymentMode, updatedAt: null, updatedBy: null };
  }
}

export async function getRuntimeDeliveryMode(): Promise<EmailMode> {
  return (await getRuntimeDeliveryModeState()).effectiveMode;
}
