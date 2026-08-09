"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { generateRecipientPreview, normalizeBusinessType } from "@/lib/email-previews/generator";
import { localDateTimeToUtc } from "@/lib/scheduling/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const uuidSchema = z.uuid();
const emailContentSchema = z.object({
  draftId: z.uuid(),
  campaignId: z.uuid(),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().min(1).max(50000),
});
const scheduleSchema = z.discriminatedUnion("scheduleMode", [
  z.object({ scheduleMode: z.literal("now"), campaignId: z.uuid(), timezone: z.string().trim().min(1).max(100) }),
  z.object({
    scheduleMode: z.literal("later"),
    campaignId: z.uuid(),
    timezone: z.string().trim().min(1).max(100),
    localDateTime: z.string().min(1),
  }),
]);

function campaignLocation(campaignId: string, notice: string) {
  return `/campaigns/${campaignId}?notice=${notice}`;
}

export async function assignCampaignSendersAction(formData: FormData) {
  await requireAdmin();
  const campaignId = uuidSchema.safeParse(formData.get("campaignId"));
  const senderIds = z.array(z.uuid()).safeParse(formData.getAll("senderId"));
  if (!campaignId.success || !senderIds.success || senderIds.data.length === 0) {
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
  const parsed = scheduleSchema.safeParse({
    scheduleMode: formData.get("scheduleMode"),
    campaignId: formData.get("campaignId"),
    timezone: formData.get("timezone"),
    localDateTime: formData.get("localDateTime"),
  });
  if (!parsed.success) redirect("/campaigns");

  let scheduledAt: Date;
  try {
    scheduledAt = parsed.data.scheduleMode === "now"
      ? new Date()
      : localDateTimeToUtc(parsed.data.localDateTime, parsed.data.timezone);
  } catch {
    redirect(campaignLocation(parsed.data.campaignId, "schedule-invalid"));
  }
  if (parsed.data.scheduleMode === "later" && scheduledAt.getTime() <= Date.now()) {
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
  const parsed = emailContentSchema.safeParse({
    draftId: formData.get("draftId"),
    campaignId: formData.get("campaignId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("email_drafts").update({ subject: parsed.data.subject, body: parsed.data.body }).eq("id", parsed.data.draftId).eq("status", "GENERATED");
  revalidatePath(`/campaigns/${parsed.data.campaignId}/emails`);
}

export async function approveEmailPreviewAction(formData: FormData) {
  await requireAdmin();
  const parsed = emailContentSchema.safeParse({
    draftId: formData.get("draftId"),
    campaignId: formData.get("campaignId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("approve_email_preview", {
    p_email_draft_id: parsed.data.draftId,
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
  });
  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  revalidatePath(`/campaigns/${parsed.data.campaignId}/emails`);
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
