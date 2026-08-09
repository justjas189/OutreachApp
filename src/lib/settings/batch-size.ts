import "server-only";

import { getEmailBatchSize } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  EMAIL_BATCH_SIZE_MAX,
  EMAIL_BATCH_SIZE_MIN,
} from "./batch-size-shared";

export type RuntimeEmailBatchSizeState = {
  effectiveBatchSize: number;
  storedBatchSize: number | null;
  environmentBatchSize: number;
  source: "database" | "environment-fallback";
  updatedAt: string | null;
  updatedBy: string | null;
};

export function isValidEmailBatchSize(value: unknown): value is number {
  return Number.isInteger(value)
    && Number(value) >= EMAIL_BATCH_SIZE_MIN
    && Number(value) <= EMAIL_BATCH_SIZE_MAX;
}

export function resolveRuntimeEmailBatchSize(
  storedBatchSize: unknown,
  environmentBatchSize: number,
  databaseAvailable = true,
): Pick<RuntimeEmailBatchSizeState, "effectiveBatchSize" | "storedBatchSize" | "source"> {
  if (databaseAvailable && isValidEmailBatchSize(storedBatchSize)) {
    return {
      effectiveBatchSize: storedBatchSize,
      storedBatchSize,
      source: "database",
    };
  }

  return {
    effectiveBatchSize: environmentBatchSize,
    storedBatchSize: null,
    source: "environment-fallback",
  };
}

export async function getRuntimeEmailBatchSizeState(): Promise<RuntimeEmailBatchSizeState> {
  const environmentBatchSize = getEmailBatchSize();
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("application_settings")
      .select("email_batch_size,updated_at,updated_by")
      .eq("singleton", true)
      .maybeSingle();

    if (error) {
      const resolved = resolveRuntimeEmailBatchSize(null, environmentBatchSize, false);
      return { ...resolved, environmentBatchSize, updatedAt: null, updatedBy: null };
    }

    const resolved = resolveRuntimeEmailBatchSize(data?.email_batch_size ?? null, environmentBatchSize);
    return {
      ...resolved,
      environmentBatchSize,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
    };
  } catch {
    const resolved = resolveRuntimeEmailBatchSize(null, environmentBatchSize, false);
    return { ...resolved, environmentBatchSize, updatedAt: null, updatedBy: null };
  }
}

export async function getRuntimeEmailBatchSize(): Promise<number> {
  return (await getRuntimeEmailBatchSizeState()).effectiveBatchSize;
}
