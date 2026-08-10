import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CampaignRunControl } from "@/components/campaign-run-control";
import { SenderAssignmentControl } from "@/components/sender-assignment-control";
import { TimezoneSelect } from "@/components/timezone-select";
import { decideCampaignDisposition } from "@/lib/campaigns/lifecycle";
import { parseCampaignReadiness } from "@/lib/campaigns/readiness";
import { parseCampaignRunReadiness } from "@/lib/campaigns/runs";
import { getRecipientGuardMode } from "@/lib/env";
import { getPagination } from "@/lib/pagination";
import {
  formatForDateTimeLocal,
  formatInTimeZone,
  formatTimeZoneLabel,
  getSupportedTimeZones,
} from "@/lib/scheduling/timezone";
import { getRuntimeDeliveryModeState } from "@/lib/settings/delivery-mode";
import { getRuntimeEmailBatchSizeState } from "@/lib/settings/batch-size";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  cancelCampaignScheduleAction,
  generateCampaignPreviewsAction,
  manageCampaignLifecycleAction,
  pauseCampaignAction,
  resumeCampaignAction,
  scheduleCampaignAction,
  updateCampaignDetailsAction,
} from "./actions";

export const metadata: Metadata = { title: "Campaign details" };

type CampaignDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSafeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: CampaignDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const [
    campaignResult,
    countResult,
    connectedSenderResult,
    draftCountResult,
    generatedCountResult,
    approvedCountResult,
    recipientStatusesResult,
    queueResult,
    sendLogResult,
    readinessResult,
    deliveryState,
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id,name,city,status,created_at,google_sheet_id,worksheet_name,started_at,completed_at,scheduled_at,schedule_timezone,paused_at,archived_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id),
    supabase
      .from("sender_accounts")
      .select("id,display_name,email,status")
      .eq("status", "CONNECTED")
      .order("created_at", { ascending: true }),
    supabase
      .from("email_drafts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id),
    supabase
      .from("email_drafts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "GENERATED"),
    supabase
      .from("email_drafts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "APPROVED"),
    supabase.from("recipients").select("status,assigned_sender_id").eq("campaign_id", id),
    supabase.from("email_queue").select("status,delivery_mode,attempts,max_attempts").eq("campaign_id", id),
    supabase
      .from("send_logs")
      .select("id,status,provider_message_id,error_message,created_at,sender_account_id,recipient_id", { count: "exact" })
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.rpc("get_campaign_readiness", { p_campaign_id: id }),
    getRuntimeDeliveryModeState(),
  ]);

  if (
    campaignResult.error ||
    countResult.error ||
    connectedSenderResult.error ||
    draftCountResult.error ||
    generatedCountResult.error ||
    approvedCountResult.error
    || recipientStatusesResult.error
    || queueResult.error
    || sendLogResult.error
    || readinessResult.error
  ) {
    throw new Error("Campaign details could not be loaded from Supabase.");
  }

  if (!campaignResult.data) {
    notFound();
  }

  const recipientCount = countResult.count ?? 0;
  const pagination = getPagination(query.page, recipientCount);
  const { data: recipients, error: recipientError } = await supabase
    .from("recipients")
    .select("id,name,email,link,business_type,status,created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(pagination.from, pagination.to);

  if (recipientError) {
    throw new Error("Campaign recipients could not be loaded from Supabase.");
  }

  const campaign = campaignResult.data;
  const recipientGuardMode = getRecipientGuardMode();
  const [runReadinessResult, runsResult, batchSizeState] = await Promise.all([
    supabase.rpc("get_campaign_run_readiness", { p_campaign_id: id, p_recipient_guard_mode: recipientGuardMode }),
    supabase.from("campaign_runs").select("id,run_number,status,delivery_mode,sender_strategy,run_scope,scheduled_at,schedule_timezone,started_at,completed_at,created_at,retry_of_run_id").eq("campaign_id", id).order("run_number", { ascending: false }),
    getRuntimeEmailBatchSizeState(),
  ]);
  if (runReadinessResult.error || runsResult.error) throw new Error("Campaign run history could not be loaded.");
  const runReadiness = parseCampaignRunReadiness(runReadinessResult.data);
  const latestRun = runsResult.data?.[0] ?? null;
  const readiness = parseCampaignReadiness(readinessResult.data);
  const archived = campaign.status === "ARCHIVED" || Boolean(campaign.archived_at);
  const createdAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(campaign.created_at));
  const sheetUrl = campaign.google_sheet_id
    ? `https://docs.google.com/spreadsheets/d/${campaign.google_sheet_id}`
    : null;
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const noticeMessages: Record<string, { tone: string; message: string }> = {
    imported: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign imported. Select connected senders for balanced assignment." },
    assigned: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Recipients assigned evenly across selected connected senders." },
    "assignment-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Sender assignment failed. Assignment locks after previews exist." },
    "sender-required": { tone: "border-red-200 bg-red-50 text-red-800", message: "Assign every recipient to connected senders before generation." },
    "template-required": { tone: "border-red-200 bg-red-50 text-red-800", message: "Create a template for every recipient Business Type before generation." },
    "generation-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Email previews could not be generated. No Gmail operation occurred." },
    scheduled: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign schedule saved. The server worker will wait until it is eligible." },
    "schedule-cancelled": { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Future schedule cancelled before processing started." },
    paused: { tone: "border-[#f1d6a6] bg-[#fff8e8] text-[#805516]", message: "Campaign paused. Future queue claims are blocked." },
    resumed: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign resumed. Processing continues only when its schedule is due." },
    "schedule-invalid": { tone: "border-red-200 bg-red-50 text-red-800", message: "Schedule date, time, or timezone is invalid or ambiguous." },
    "schedule-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Schedule change was rejected. Approve email first; future schedules lock when processing starts." },
    updated: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign details updated." },
    "edit-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Campaign details could not be updated. City locks after previews; all details lock after sending starts." },
    archived: { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign archived. History is preserved and no future queue work can run." },
    "lifecycle-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Campaign deletion/archive was rejected by the database lifecycle rules." },
    "run-created": { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "New campaign run created. Previous run history remains unchanged." },
    "run-blocked": { tone: "border-red-200 bg-red-50 text-red-800", message: "Run creation was blocked by current eligibility, lifecycle, sender, or concurrency checks." },
    "run-invalid": { tone: "border-red-200 bg-red-50 text-red-800", message: "Choose a valid sender strategy and recipient scope." },
  };
  const currentNotice = notice ? noticeMessages[notice] : undefined;
  const recipientStatusCounts = new Map<string, number>();
  for (const recipient of recipientStatusesResult.data ?? []) {
    recipientStatusCounts.set(recipient.status, (recipientStatusCounts.get(recipient.status) ?? 0) + 1);
  }
  const queueStatusCounts = new Map<string, number>();
  for (const item of queueResult.data ?? []) {
    queueStatusCounts.set(item.status, (queueStatusCounts.get(item.status) ?? 0) + 1);
  }
  const scheduleTimezone = campaign.schedule_timezone ?? "UTC";
  const futureSchedule = Boolean(campaign.scheduled_at && campaign.status === "READY" && !campaign.started_at);
  const scheduleEditable = false;
  const scheduleInputValue = campaign.scheduled_at && campaign.schedule_timezone
    ? formatForDateTimeLocal(campaign.scheduled_at, campaign.schedule_timezone)
    : "";
  const emailMode = deliveryState.effectiveMode;
  const sentEmailCount = recipientStatusCounts.get("SENT") ?? 0;
  const processingQueueCount = queueStatusCounts.get("PROCESSING") ?? 0;
  const disposition = decideCampaignDisposition({
    sentEmails: sentEmailCount,
    historyRecords: sendLogResult.count ?? 0,
    processingQueueItems: processingQueueCount,
  });
  const assignmentEditable = !archived
    && !campaign.started_at
    && (queueResult.data?.length ?? 0) === 0
    && (sendLogResult.count ?? 0) === 0;
  const detailsEditable = !archived && !campaign.started_at && (sendLogResult.count ?? 0) === 0;
  const cityEditable = detailsEditable && (draftCountResult.count ?? 0) === 0;
  const workflowEditable = !archived && !campaign.started_at && (queueResult.data?.length ?? 0) === 0;
  const assignedSenderIds = new Set(
    (recipientStatusesResult.data ?? [])
      .map((recipient) => recipient.assigned_sender_id)
      .filter((senderId): senderId is string => Boolean(senderId)),
  );
  const timezoneOptions = getSupportedTimeZones().map((zone) => ({
    label: formatTimeZoneLabel(zone),
    value: zone,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <Link className="text-sm font-bold text-[#2563a6] hover:underline" href="/campaigns">
        ← Back to campaigns
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">
            Campaign details
          </p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">{campaign.name}</h1>
          <p className="mt-2 text-[#526873]">{campaign.city}</p>
        </div>
        <span className="mono self-start rounded-full bg-[#e5edf2] px-3 py-1.5 text-[0.68rem] font-bold tracking-[0.08em]">
          {campaign.status}
        </span>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Created</p>
          <p className="mt-2 text-sm font-bold">{createdAt}</p>
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Recipients</p>
          <p className="mt-2 text-2xl font-[800]">{recipientCount}</p>
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Google Sheet source</p>
          {sheetUrl ? (
            <a
              className="mono mt-2 block truncate text-xs font-bold text-[#2563a6] hover:underline"
              href={sheetUrl}
              rel="noreferrer"
              target="_blank"
              title={campaign.google_sheet_id ?? undefined}
            >
              {campaign.google_sheet_id}
            </a>
          ) : (
            <p className="mt-2 text-sm text-[#607580]">Not recorded</p>
          )}
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Worksheet</p>
          <p className="mono mt-2 truncate text-sm font-bold">{campaign.worksheet_name ?? "Not recorded"}</p>
        </article>
      </section>

      {currentNotice ? (
        <p className={`mt-5 rounded-lg border px-4 py-3 text-sm font-bold ${currentNotice.tone}`} role="status">
          {currentNotice.message}
        </p>
      ) : null}

      {archived ? (
        <div className="mt-5 rounded-lg border border-[#c8d4d0] bg-[#f4f7f6] px-5 py-4">
          <p className="font-extrabold">Archived history · read-only</p>
          <p className="mt-1 text-sm text-[#526873]">
            Recipient, preview, sender, queue, and delivery records remain available for audit. Scheduling and processing are permanently disabled.
          </p>
        </div>
      ) : null}

      <section className="panel mt-8 p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Campaign metadata</p>
            <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Edit campaign details</h2>
          </div>
          {!cityEditable && detailsEditable ? (
            <span className="mono rounded-full bg-[#fff0d6] px-2.5 py-1 text-[0.62rem] font-bold text-[#805516]">City locked after preview</span>
          ) : null}
        </div>
        {detailsEditable ? (
          <form action={updateCampaignDetailsAction} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input name="campaignId" type="hidden" value={id} />
            <label className="text-sm font-bold">Campaign name
              <input className="field mt-2" defaultValue={campaign.name} maxLength={120} minLength={2} name="name" required />
            </label>
            <label className="text-sm font-bold">City
              <input className="field mt-2 read-only:bg-[#eef2f1]" defaultValue={campaign.city} maxLength={120} minLength={2} name="city" readOnly={!cityEditable} required />
            </label>
            <button className="button-primary" type="submit">Save details</button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[#607580]">Details are locked because this campaign is archived or sending history has started.</p>
        )}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="panel p-6">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Sender assignment</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Choose sender strategy</h2>
          {!assignmentEditable ? (
            <p className="mt-3 text-sm text-[#607580]">Assignment is locked after queue processing starts or when the campaign is archived.</p>
          ) : connectedSenderResult.data?.length ? (
            <SenderAssignmentControl
              campaignId={id}
              initialSenderIds={[...assignedSenderIds]}
              senders={connectedSenderResult.data.map((sender) => ({ id: sender.id, displayName: sender.display_name, email: sender.email }))}
            />
          ) : (
            <p className="mt-4 text-sm text-[#607580]">No connected senders. <Link className="font-bold text-[#2563a6]" href="/senders">Create sender invite →</Link></p>
          )}
        </article>

        <article className="panel p-6">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Email workflow</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Generate stored previews</h2>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[["Stored", draftCountResult.count ?? 0], ["Generated", generatedCountResult.count ?? 0], ["Approved", approvedCountResult.count ?? 0]].map(([label, value]) => (
              <div className="rounded-lg bg-[#eef4f7] p-3" key={label}><p className="mono text-[0.6rem] uppercase text-[#607580]">{label}</p><p className="mt-1 text-xl font-extrabold">{value}</p></div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#607580]">Generation uses deterministic templates and stores database previews only. It never creates Gmail drafts or sends mail.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {workflowEditable ? (
              <form action={generateCampaignPreviewsAction}>
                <input name="campaignId" type="hidden" value={id} />
                <button className="button-primary" type="submit">Generate previews</button>
              </form>
            ) : null}
            <Link className="rounded-md border border-[#c8d4d0] px-4 py-2 text-sm font-bold" href={`/campaigns/${id}/emails`}>Review emails</Link>
          </div>
        </article>
      </section>

      <section className={`mt-8 rounded-xl border p-6 ${readiness.ready ? "border-[#bfd8ca] bg-[#eef8f2]" : "border-[#f1d6a6] bg-[#fff8e8]"}`}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Campaign readiness</p>
            <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">
              {readiness.ready ? "Ready for Quick Run" : "Needs attention before scheduling"}
            </h2>
          </div>
          <span className={`mono self-start rounded-full px-3 py-1 text-[0.62rem] font-bold uppercase ${readiness.ready ? "bg-[#d9eee5] text-[#1f6e4c]" : "bg-[#fff0d6] text-[#805516]"}`}>
            {readiness.ready ? "Ready" : `${readiness.blockingReasons.length} blockers`}
          </span>
        </div>
        {readiness.ready ? (
          <p className="mt-3 text-sm text-[#1f6e4c]">Recipients, templates, approvals, sender connections, credentials, lifecycle, and queue state passed server checks.</p>
        ) : (
          <ul className="mt-4 grid gap-2 text-sm text-[#805516] sm:grid-cols-2">
            {readiness.blockingReasons.map((reason) => <li key={reason}>• {reason}</li>)}
          </ul>
        )}
      </section>

      {!archived ? (
        <section className={`panel mt-8 border-2 p-6 ${campaign.status === "FAILED" ? "border-red-300" : "border-[#bfd8ca]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Campaign run</p>
              <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">
                {campaign.status === "FAILED" ? "Retry failed emails" : campaign.status === "COMPLETED" ? "Run campaign again" : "Start a new run"}
              </h2>
              <p className="mt-2 text-sm text-[#526873]">Every run freezes sender choice, approved content, delivery mode, batch size, and schedule. History never resets.</p>
            </div>
            {latestRun ? <span className="mono rounded-full bg-[#e5edf2] px-3 py-1 text-xs font-bold uppercase">Last: Run #{latestRun.run_number} · {latestRun.status}</span> : null}
          </div>
          <CampaignRunControl
            batchSize={batchSizeState.effectiveBatchSize}
            campaignId={id}
            campaignName={campaign.name}
            deliveryMode={emailMode}
            latestRunStatus={latestRun?.status ?? null}
            readiness={runReadiness}
            senders={(connectedSenderResult.data ?? []).map((sender) => ({ id: sender.id, displayName: sender.display_name, email: sender.email }))}
            timezoneOptions={timezoneOptions}
          />
        </section>
      ) : null}

      <section className="panel mt-8 overflow-hidden">
        <div className="border-b border-[#d4ddd9] px-6 py-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Run history</p>
          <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">Campaign executions</h2>
        </div>
        {runsResult.data?.length ? <div className="divide-y divide-[#dce4e1]">{runsResult.data.map((run) => (
          <article className="grid gap-3 px-6 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={run.id}>
            <span className="font-extrabold">Run #{run.run_number}</span>
            <p className="text-sm text-[#526873]">{run.sender_strategy} · {run.run_scope} · {run.delivery_mode} · {formatInTimeZone(run.scheduled_at, run.schedule_timezone)}</p>
            <span className="mono rounded-full bg-[#eef4f7] px-3 py-1 text-xs font-bold">{run.status}</span>
          </article>
        ))}</div> : <p className="px-6 py-5 text-sm text-[#607580]">No campaign runs yet.</p>}
      </section>

      <section className="panel mt-8 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Active run controls</p>
            <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Schedule and pause state</h2>
            {campaign.scheduled_at ? (
              <p className="mt-2 text-sm text-[#526873]">
                {formatInTimeZone(campaign.scheduled_at, scheduleTimezone)} · {formatInTimeZone(campaign.scheduled_at, "UTC")} · timezone: <strong>{scheduleTimezone}</strong>
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#526873]">No start time selected. Timezone will be stored with the UTC instant.</p>
            )}
          </div>
          <span className={`mono rounded-full px-3 py-1.5 text-[0.65rem] font-bold uppercase ${emailMode === "live" ? "bg-red-600 text-white" : "bg-[#e5edf2]"}`}>
            {emailMode} mode
          </span>
        </div>

        {scheduleEditable ? (
          <form action={scheduleCampaignAction} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-[10rem_minmax(15rem,1fr)_minmax(15rem,1fr)_auto] xl:items-start">
            <input name="campaignId" type="hidden" value={id} />
            <label className="text-sm font-bold">Start
              <select className="field mt-2 min-h-12" defaultValue={campaign.scheduled_at && futureSchedule ? "later" : "now"} name="scheduleMode">
                <option value="now">Send now</option>
                <option value="later">Schedule</option>
              </select>
            </label>
            <label className="text-sm font-bold">Local date and time
              <input className="field mt-2 min-h-12" defaultValue={scheduleInputValue} name="localDateTime" type="datetime-local" />
            </label>
            <TimezoneSelect
              initialValue={campaign.schedule_timezone}
              options={timezoneOptions}
            />
            <button className="button-primary min-h-12 w-full sm:col-span-2 xl:col-span-1 xl:mt-[1.75rem] xl:w-auto" type="submit">Save schedule</button>
          </form>
        ) : (
          <p className="mt-5 text-sm text-[#607580]">
            {archived
              ? "Archived campaigns cannot be scheduled or processed."
              : "Create schedules through the new campaign-run control above. Existing active schedules remain pausable or cancellable here."}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {futureSchedule ? (
            <form action={cancelCampaignScheduleAction}>
              <input name="campaignId" type="hidden" value={id} />
              <ConfirmSubmitButton
                className="rounded-md border border-[#c8d4d0] px-4 py-2 text-sm font-bold"
                confirmation="Cancel this future schedule? No email will be queued until a new start time is saved."
              >
                Cancel future schedule
              </ConfirmSubmitButton>
            </form>
          ) : null}
          {campaign.scheduled_at && (campaign.status === "ACTIVE" || campaign.status === "READY") ? (
            <form action={pauseCampaignAction}>
              <input name="campaignId" type="hidden" value={id} />
              <ConfirmSubmitButton
                className="rounded-md border border-[#e4b76b] px-4 py-2 text-sm font-bold text-[#805516]"
                confirmation="Pause this campaign? Future queue claims will stop until you resume it."
              >
                Pause campaign
              </ConfirmSubmitButton>
            </form>
          ) : null}
          {campaign.status === "PAUSED" ? (
            <form action={resumeCampaignAction}>
              <input name="campaignId" type="hidden" value={id} />
              <button className="button-primary" type="submit">Resume campaign</button>
            </form>
          ) : null}
        </div>
        {emailMode === "preview" ? <p className="mt-4 text-xs font-bold text-[#805516]">Preview mode never enqueues or calls Gmail. The schedule waits until a draft/live worker is deliberately enabled.</p> : null}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Approved", recipientStatusCounts.get("APPROVED") ?? 0],
            ["Queued", recipientStatusCounts.get("QUEUED") ?? 0],
            ["Sent", recipientStatusCounts.get("SENT") ?? 0],
            ["Failed", recipientStatusCounts.get("FAILED") ?? 0],
            ["Suppressed", recipientStatusCounts.get("SUPPRESSED") ?? 0],
            ["Retry", queueStatusCounts.get("RETRY") ?? 0],
            ["Processing", queueStatusCounts.get("PROCESSING") ?? 0],
          ].map(([label, value]) => (
            <div className="rounded-lg bg-[#eef4f7] p-3" key={label}><p className="mono text-[0.58rem] uppercase text-[#607580]">{label}</p><p className="mt-1 text-xl font-extrabold">{value}</p></div>
          ))}
        </div>
      </section>

      <section className="panel mt-8 overflow-hidden">
        <div className="border-b border-[#d4ddd9] px-6 py-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Audit trail</p>
          <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">Recent delivery history</h2>
          <p className="mt-2 text-sm text-[#607580]">{sendLogResult.count ?? 0} total history records</p>
        </div>
        {sendLogResult.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead className="bg-[#eaf0f2]">
                <tr className="mono text-[0.65rem] uppercase tracking-[0.1em] text-[#536d79]">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Result</th>
                  <th className="px-5 py-3">Provider ID</th>
                  <th className="px-5 py-3">Safe detail</th>
                </tr>
              </thead>
              <tbody>
                {sendLogResult.data.map((entry) => (
                  <tr className="border-t border-[#dce4e1]" key={entry.id}>
                    <td className="px-5 py-4 text-[#526873]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</td>
                    <td className="px-5 py-4"><span className="mono rounded-full bg-[#e5edf2] px-2 py-1 text-[0.65rem] font-bold">{entry.status}</span></td>
                    <td className="mono max-w-56 truncate px-5 py-4 text-xs">{entry.provider_message_id ?? "—"}</td>
                    <td className="max-w-80 truncate px-5 py-4 text-[#526873]" title={entry.error_message ?? undefined}>{entry.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-sm text-[#607580]">No queue or delivery history yet.</div>
        )}
      </section>

      {!archived ? (
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-red-700">Campaign lifecycle</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">
            {disposition === "DELETE" ? "Permanently delete campaign" : "Archive campaign history"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-red-900/75">
            {disposition === "DELETE"
              ? "No sent or history records exist. The database may permanently remove this campaign, recipients, previews, schedules, sender assignments, and unsent queue work."
              : "Sent, history, or in-flight records make hard deletion unsafe. The database will preserve audit history, cancel future work, and make the campaign read-only."}
          </p>
          <form action={manageCampaignLifecycleAction} className="mt-5">
            <input name="campaignId" type="hidden" value={id} />
            <ConfirmSubmitButton
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-extrabold text-red-800 hover:bg-red-100"
              confirmation={disposition === "DELETE"
                ? `Permanently delete “${campaign.name}” and all safe unsent records? This cannot be undone.`
                : `Archive “${campaign.name}”? Future schedules and unsent queue work will be cancelled.`}
            >
              {disposition === "DELETE" ? "Delete permanently" : "Archive campaign"}
            </ConfirmSubmitButton>
          </form>
          <p className="mt-3 text-xs text-red-900/65">Final eligibility is recalculated inside one locked database transaction. The browser does not choose delete versus archive.</p>
        </section>
      ) : null}

      <section className="panel mt-8 overflow-hidden">
        <div className="flex items-end justify-between gap-4 border-b border-[#d4ddd9] px-5 py-5 sm:px-6">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Imported recipients</p>
            <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">Recipient list</h2>
          </div>
          <p className="mono text-xs text-[#607580]">
            Page {pagination.page} / {pagination.pageCount}
          </p>
        </div>

        {recipients?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
              <thead className="bg-[#eaf0f2]">
                <tr className="mono text-[0.65rem] uppercase tracking-[0.1em] text-[#536d79]">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Link</th>
                  <th className="px-5 py-3">Business Type</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => {
                  const safeLink = getSafeLink(recipient.link);
                  return (
                    <tr className="border-t border-[#dce4e1]" key={recipient.id}>
                      <td className="px-5 py-4 font-extrabold">{recipient.name}</td>
                      <td className="mono px-5 py-4 text-xs">{recipient.email}</td>
                      <td className="max-w-64 px-5 py-4">
                        {safeLink ? (
                          <a
                            className="block truncate text-[#2563a6] hover:underline"
                            href={safeLink}
                            rel="noreferrer"
                            target="_blank"
                            title={recipient.link}
                          >
                            {recipient.link}
                          </a>
                        ) : (
                          <span className="block truncate text-[#526873]" title={recipient.link}>
                            {recipient.link}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">{recipient.business_type}</td>
                      <td className="px-5 py-4">
                        <span className="mono rounded-full bg-[#e5edf2] px-2 py-1 text-[0.65rem] font-bold">
                          {recipient.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center text-sm text-[#607580]">
            No recipients imported for this campaign.
          </div>
        )}

        {pagination.pageCount > 1 ? (
          <nav
            aria-label="Recipient pages"
            className="flex items-center justify-between border-t border-[#d4ddd9] bg-[#f8faf9] px-5 py-4 sm:px-6"
          >
            {pagination.page > 1 ? (
              <Link
                className="rounded-md border border-[#c8d4d0] px-3 py-1.5 text-xs font-bold hover:bg-white"
                href={`/campaigns/${id}?page=${pagination.page - 1}`}
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {pagination.page < pagination.pageCount ? (
              <Link
                className="rounded-md border border-[#c8d4d0] px-3 py-1.5 text-xs font-bold hover:bg-white"
                href={`/campaigns/${id}?page=${pagination.page + 1}`}
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
