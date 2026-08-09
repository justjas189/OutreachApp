"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { parseCampaignReadiness } from "@/lib/campaigns/readiness";
import { getEmailMode } from "@/lib/env";
import { resolveScheduleDate, scheduleInputSchema } from "@/lib/scheduling/schedule-input";
import {
  EMAIL_BATCH_SIZE_MAX,
  EMAIL_BATCH_SIZE_MIN,
} from "@/lib/settings/batch-size-shared";
import { isModeAllowedByDeployment } from "@/lib/settings/delivery-mode";
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
  const parsed = scheduleInputSchema.safeParse({
    scheduleMode: formData.get("scheduleMode"),
    campaignId: formData.get("campaignId"),
    timezone: formData.get("timezone"),
    localDateTime: formData.get("localDateTime"),
  });
  if (!parsed.success) redirect("/dashboard?notice=quick-run-invalid");

  let scheduledAt: Date;
  try {
    scheduledAt = resolveScheduleDate(parsed.data);
  } catch {
    redirect("/dashboard?notice=quick-run-invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data: readinessData, error: readinessError } = await supabase.rpc("get_campaign_readiness", {
    p_campaign_id: parsed.data.campaignId,
  });
  const readiness = parseCampaignReadiness(readinessData);
  if (readinessError || !readiness.ready) {
    redirect(`/dashboard?notice=quick-run-blocked&campaign=${parsed.data.campaignId}`);
  }

  const { error } = await supabase.rpc("schedule_campaign", {
    p_campaign_id: parsed.data.campaignId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_schedule_timezone: parsed.data.timezone,
  });
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  redirect(`/dashboard?notice=${error ? "quick-run-blocked" : parsed.data.scheduleMode === "now" ? "quick-run-started" : "quick-run-scheduled"}&campaign=${parsed.data.campaignId}`);
}
