"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { campaignRunFormSchema, parseCampaignRunReadiness } from "@/lib/campaigns/runs";
import { getEmailMode, getRecipientGuardMode } from "@/lib/env";
import {
  parseQuickRunFormData,
  QuickRunInputError,
  resolveQuickRunSchedule,
} from "@/lib/scheduling/quick-run-input";
import {
  EMAIL_BATCH_SIZE_MAX,
  EMAIL_BATCH_SIZE_MIN,
} from "@/lib/settings/batch-size-shared";
import { isModeAllowedByDeployment } from "@/lib/settings/delivery-mode";
import { getRuntimeEmailBatchSize } from "@/lib/settings/batch-size";
import { getRuntimeDeliveryMode } from "@/lib/settings/delivery-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const modeSchema = z.enum(["preview", "draft", "live"]);
const batchSizeSchema = z.coerce.number().int().min(EMAIL_BATCH_SIZE_MIN).max(EMAIL_BATCH_SIZE_MAX);

export async function setDeliveryModeAction(formData: FormData) {
  await requireAdmin();
  const mode = modeSchema.safeParse(formData.get("mode"));
  if (!mode.success) redirect("/dashboard?notice=mode-invalid");

  const deploymentMode = getEmailMode();
  if (!isModeAllowedByDeployment(mode.data, deploymentMode)) {
    redirect("/dashboard?notice=mode-constrained");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_runtime_email_mode", { p_mode: mode.data });
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  redirect(`/dashboard?notice=${error ? "mode-error" : "mode-updated"}`);
}

export async function setEmailBatchSizeAction(formData: FormData) {
  await requireAdmin();
  const batchSize = batchSizeSchema.safeParse(formData.get("batchSize"));
  if (!batchSize.success) redirect("/dashboard?notice=batch-size-invalid");

  const liveChangeConfirmed = formData.get("liveChangeConfirmed") === "true";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_runtime_email_batch_size", {
    p_batch_size: batchSize.data,
    p_live_change_confirmed: liveChangeConfirmed,
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard?notice=${error ? "batch-size-error" : "batch-size-updated"}`);
}

export async function quickRunCampaignAction(formData: FormData) {
  await requireAdmin();
  let input;
  try {
    input = parseQuickRunFormData(formData);
  } catch (error) {
    if (error instanceof QuickRunInputError) redirect(`/dashboard?notice=quick-run-${error.code}`);
    throw error;
  }
  let schedule;
  try {
    schedule = resolveQuickRunSchedule(input);
  } catch (error) {
    if (error instanceof QuickRunInputError) redirect(`/dashboard?notice=quick-run-${error.code}`);
    throw error;
  }

  const runInput = campaignRunFormSchema.safeParse({
    campaignId: input.campaignId,
    senderStrategy: formData.get("senderStrategy"),
    senderIds: formData.getAll("senderId"),
    runScope: formData.get("runScope"),
  });
  if (!runInput.success) redirect(`/dashboard?notice=quick-run-sender-invalid&campaign=${input.campaignId}`);

  const supabase = await createSupabaseServerClient();
  const recipientGuardMode = getRecipientGuardMode();
  const { data: readinessData, error: readinessError } = await supabase.rpc("get_campaign_run_readiness", {
    p_campaign_id: input.campaignId,
    p_recipient_guard_mode: recipientGuardMode,
  });
  const readiness = parseCampaignRunReadiness(readinessData);
  const scopeReady = runInput.data.runScope === "failed" ? readiness.canRetryFailed : readiness.canRunAll;
  if (readinessError || !scopeReady) {
    redirect(`/dashboard?notice=quick-run-blocked&campaign=${input.campaignId}`);
  }

  const [deliveryMode, batchSize] = await Promise.all([
    getRuntimeDeliveryMode(),
    getRuntimeEmailBatchSize(),
  ]);
  const { error } = await supabase.rpc("create_campaign_run", {
    p_campaign_id: input.campaignId,
    p_delivery_mode: deliveryMode,
    p_batch_size: batchSize,
    p_sender_strategy: runInput.data.senderStrategy,
    p_sender_ids: runInput.data.senderIds,
    p_run_scope: runInput.data.runScope,
    p_scheduled_at: schedule.scheduledAt.toISOString(),
    p_schedule_timezone: schedule.scheduleTimezone,
    p_recipient_guard_mode: recipientGuardMode,
  });
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${input.campaignId}`);
  redirect(`/dashboard?notice=${error ? "quick-run-blocked" : input.executionType === "now" ? "quick-run-started" : "quick-run-scheduled"}&campaign=${input.campaignId}`);
}
