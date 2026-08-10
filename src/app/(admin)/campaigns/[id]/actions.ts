"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { campaignRunFormSchema, parseCampaignRunReadiness } from "@/lib/campaigns/runs";
import { generateRecipientPreview, normalizeBusinessType } from "@/lib/email-previews/generator";
import { getRecipientGuardMode } from "@/lib/env";
import { normalizeRichTemplate } from "@/lib/templates/rich-text";
import { parseQuickRunFormData, resolveQuickRunSchedule } from "@/lib/scheduling/quick-run-input";
import { resolveScheduleDate, scheduleInputSchema } from "@/lib/scheduling/schedule-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRuntimeEmailBatchSize } from "@/lib/settings/batch-size";
import { getRuntimeDeliveryMode } from "@/lib/settings/delivery-mode";
import type { Json } from "@/types/database";

const uuidSchema = z.uuid();
const emailContentSchema = z.object({
  draftId: z.uuid(),
  campaignId: z.uuid(),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  bodyHtml: z.string().min(1).max(100000),
});

function parseEmailContent(formData: FormData) {
  const parsed = emailContentSchema.safeParse({
    draftId: formData.get("draftId"),
    campaignId: formData.get("campaignId"),
    subject: formData.get("subject"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return null;
  try {
    const body = normalizeRichTemplate(parsed.data.bodyHtml);
    if (body.text.length > 50000) return null;
    return { ...parsed.data, body: body.text, bodyHtml: body.html };
  } catch {
    return null;
  }
}
const campaignDetailsSchema = z.object({
  campaignId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
});

function campaignLocation(campaignId: string, notice: string) {
  return `/campaigns/${campaignId}?notice=${notice}`;
}

export async function updateCampaignDetailsAction(formData: FormData) {
  await requireAdmin();
  const parsed = campaignDetailsSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    city: formData.get("city"),
  });
  if (!parsed.success) redirect("/campaigns");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_campaign_details", {
    p_campaign_id: parsed.data.campaignId,
    p_name: parsed.data.name,
    p_city: parsed.data.city,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  redirect(campaignLocation(parsed.data.campaignId, error || !data ? "edit-error" : "updated"));
}

export async function manageCampaignLifecycleAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) redirect("/campaigns");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("manage_campaign_lifecycle", {
    p_campaign_id: campaignId.data,
  });
  if (error || !data) redirect(campaignLocation(campaignId.data, "lifecycle-error"));

  revalidatePath("/campaigns");
  if (data === "DELETED") redirect("/campaigns?notice=deleted");
  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(campaignLocation(campaignId.data, "archived"));
}

export async function assignCampaignSendersAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  const senderIds = z.array(z.uuid()).safeParse(formData.getAll("senderId"));
  const strategy = z.enum(["single", "balanced"]).safeParse(formData.get("senderStrategy"));
  if (!campaignId.success || !senderIds.success || !strategy.success || senderIds.data.length === 0
    || (strategy.data === "single" && senderIds.data.length !== 1)
    || (strategy.data === "balanced" && senderIds.data.length < 2)) {
    redirect("/campaigns");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_campaign_senders", {
    p_campaign_id: campaignId.data,
    p_sender_ids: senderIds.data,
  });
  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(campaignLocation(campaignId.data, error ? "assignment-error" : "assigned"));
}

export async function createCampaignRunAction(formData: FormData) {
  await requireAdmin();
  let scheduleInput;
  try {
    scheduleInput = parseQuickRunFormData(formData);
  } catch {
    redirect("/campaigns");
  }
  const runInput = campaignRunFormSchema.safeParse({
    campaignId: scheduleInput.campaignId,
    senderStrategy: formData.get("senderStrategy"),
    senderIds: formData.getAll("senderId"),
    runScope: formData.get("runScope"),
  });
  if (!runInput.success) redirect(campaignLocation(scheduleInput.campaignId, "run-invalid"));

  let schedule;
  try {
    schedule = resolveQuickRunSchedule(scheduleInput);
  } catch {
    redirect(campaignLocation(scheduleInput.campaignId, "schedule-invalid"));
  }
  const recipientGuardMode = getRecipientGuardMode();
  const supabase = await createSupabaseServerClient();
  const { data: readinessData, error: readinessError } = await supabase.rpc("get_campaign_run_readiness", {
    p_campaign_id: runInput.data.campaignId,
    p_recipient_guard_mode: recipientGuardMode,
  });
  const readiness = parseCampaignRunReadiness(readinessData);
  const allowed = runInput.data.runScope === "failed" ? readiness.canRetryFailed : readiness.canRunAll;
  if (readinessError || !allowed) redirect(campaignLocation(runInput.data.campaignId, "run-blocked"));

  const [deliveryMode, batchSize] = await Promise.all([getRuntimeDeliveryMode(), getRuntimeEmailBatchSize()]);
  const { error } = await supabase.rpc("create_campaign_run", {
    p_campaign_id: runInput.data.campaignId,
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
  revalidatePath(`/campaigns/${runInput.data.campaignId}`);
  redirect(campaignLocation(runInput.data.campaignId, error ? "run-blocked" : "run-created"));
}

export async function generateCampaignPreviewsAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) redirect("/campaigns");

  const supabase = await createSupabaseServerClient();
  const { error: suppressionError } = await supabase.rpc("apply_campaign_suppressions", {
    p_campaign_id: campaignId.data,
  });
  if (suppressionError) redirect(campaignLocation(campaignId.data, "generation-error"));
  const [campaignResult, recipientCountResult, templateResult, senderResult] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", campaignId.data).maybeSingle(),
    supabase.from("recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId.data).in("status", ["PENDING", "GENERATED"]),
    supabase.from("templates").select("*"),
    supabase.from("sender_accounts").select("id,status").eq("status", "CONNECTED"),
  ]);

  if (campaignResult.error || recipientCountResult.error || templateResult.error || senderResult.error || !campaignResult.data) {
    redirect(campaignLocation(campaignId.data, "generation-error"));
  }
  const campaign = campaignResult.data;
  const recipientPageSize = 1000;
  const recipientPages = await Promise.all(
    Array.from(
      { length: Math.ceil((recipientCountResult.count ?? 0) / recipientPageSize) },
      (_, page) =>
        supabase
          .from("recipients")
          .select("*")
          .eq("campaign_id", campaignId.data)
          .in("status", ["PENDING", "GENERATED"])
          .order("created_at")
          .order("id")
          .range(page * recipientPageSize, (page + 1) * recipientPageSize - 1),
    ),
  );
  if (recipientPages.some((page) => page.error)) {
    redirect(campaignLocation(campaignId.data, "generation-error"));
  }
  const recipients = recipientPages.flatMap((page) => page.data ?? []);
  if (recipients.length === 0) redirect(`/campaigns/${campaignId.data}/emails`);

  const connectedSenderIds = new Set((senderResult.data ?? []).map((sender) => sender.id));
  if (recipients.some((recipient) => !recipient.assigned_sender_id || !connectedSenderIds.has(recipient.assigned_sender_id))) {
    redirect(campaignLocation(campaignId.data, "sender-required"));
  }

  const templates = new Map((templateResult.data ?? []).map((template) => [normalizeBusinessType(template.business_type), template]));
  if (recipients.some((recipient) => !templates.has(normalizeBusinessType(recipient.business_type)))) {
    redirect(campaignLocation(campaignId.data, "template-required"));
  }

  const drafts = recipients.map((recipient) =>
    generateRecipientPreview(
      campaign,
      recipient,
      templates.get(normalizeBusinessType(recipient.business_type))!,
    ),
  );
  for (let index = 0; index < drafts.length; index += 250) {
    const { error } = await supabase.rpc("store_generated_email_previews", {
      p_campaign_id: campaignId.data,
      p_drafts: drafts.slice(index, index + 250) as Json,
    });
    if (error) redirect(campaignLocation(campaignId.data, "generation-error"));
  }

  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(`/campaigns/${campaignId.data}/emails?notice=generated`);
}

export async function scheduleCampaignAction(formData: FormData) {
  await requireAdmin();
  const parsed = scheduleInputSchema.safeParse({
    scheduleMode: formData.get("scheduleMode"),
    campaignId: formData.get("campaignId"),
    timezone: formData.get("timezone"),
    localDateTime: formData.get("localDateTime"),
  });
  if (!parsed.success) redirect("/campaigns");

  let scheduledAt: Date;
  try {
    scheduledAt = resolveScheduleDate(parsed.data);
  } catch {
    redirect(campaignLocation(parsed.data.campaignId, "schedule-invalid"));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("schedule_campaign", {
    p_campaign_id: parsed.data.campaignId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_schedule_timezone: parsed.data.timezone,
  });
  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  redirect(campaignLocation(parsed.data.campaignId, error ? "schedule-error" : "scheduled"));
}

export async function cancelCampaignScheduleAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) redirect("/campaigns");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_campaign_schedule", { p_campaign_id: campaignId.data });
  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(campaignLocation(campaignId.data, error || !data ? "schedule-error" : "schedule-cancelled"));
}

export async function pauseCampaignAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) redirect("/campaigns");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pause_campaign", { p_campaign_id: campaignId.data });
  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(campaignLocation(campaignId.data, error || !data ? "schedule-error" : "paused"));
}

export async function resumeCampaignAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) redirect("/campaigns");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resume_campaign", { p_campaign_id: campaignId.data });
  revalidatePath(`/campaigns/${campaignId.data}`);
  redirect(campaignLocation(campaignId.data, error ? "schedule-error" : "resumed"));
}

export async function saveEmailPreviewAction(formData: FormData) {
  await requireAdmin();
  const parsed = parseEmailContent(formData);
  if (!parsed) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("email_drafts")
    .update({ subject: parsed.subject, body: parsed.body, body_html: parsed.bodyHtml })
    .eq("id", parsed.draftId)
    .eq("campaign_id", parsed.campaignId)
    .eq("status", "GENERATED");
  revalidatePath(`/campaigns/${parsed.campaignId}/emails`);
}

export async function approveEmailPreviewAction(formData: FormData) {
  await requireAdmin();
  const parsed = parseEmailContent(formData);
  if (!parsed) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("approve_email_preview", {
    p_email_draft_id: parsed.draftId,
    p_subject: parsed.subject,
    p_body: parsed.body,
    p_body_html: parsed.bodyHtml,
  });
  revalidatePath(`/campaigns/${parsed.campaignId}`);
  revalidatePath(`/campaigns/${parsed.campaignId}/emails`);
}

export async function approveAllEmailPreviewsAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("approve_campaign_email_previews", { p_campaign_id: campaignId.data });
  revalidatePath(`/campaigns/${campaignId.data}`);
  revalidatePath(`/campaigns/${campaignId.data}/emails`);
}

export async function regenerateEmailPreviewAction(formData: FormData) {
  await requireAdmin();
  const draftId = uuidSchema.safeParse(formData.get("draftId"));
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  if (!draftId.success || !campaignId.success) return;
  const supabase = await createSupabaseServerClient();
  const [draftResult, campaignResult, templatesResult] = await Promise.all([
    supabase.from("email_drafts").select("recipient_id,status").eq("id", draftId.data).eq("campaign_id", campaignId.data).maybeSingle(),
    supabase.from("campaigns").select("*").eq("id", campaignId.data).maybeSingle(),
    supabase.from("templates").select("*"),
  ]);
  if (draftResult.data?.status !== "GENERATED" || !campaignResult.data || templatesResult.error) return;

  const { data: recipient } = await supabase.from("recipients").select("*").eq("id", draftResult.data.recipient_id).eq("status", "GENERATED").maybeSingle();
  if (!recipient) return;
  const template = (templatesResult.data ?? []).find((item) => normalizeBusinessType(item.business_type) === normalizeBusinessType(recipient.business_type));
  if (!template) return;

  const draft = generateRecipientPreview(campaignResult.data, recipient, template);
  await supabase.rpc("store_generated_email_previews", {
    p_campaign_id: campaignId.data,
    p_drafts: [draft] as Json,
  });
  revalidatePath(`/campaigns/${campaignId.data}/emails`);
}
