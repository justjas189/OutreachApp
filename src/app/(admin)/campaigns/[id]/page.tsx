import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPagination } from "@/lib/pagination";
import { getEmailMode } from "@/lib/env";
import { formatForDateTimeLocal, formatInTimeZone } from "@/lib/scheduling/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  assignCampaignSendersAction,
  cancelCampaignScheduleAction,
  generateCampaignPreviewsAction,
  pauseCampaignAction,
  resumeCampaignAction,
  scheduleCampaignAction,
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
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id,name,city,status,created_at,google_sheet_id,worksheet_name,started_at,completed_at,scheduled_at,schedule_timezone,paused_at")
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
    supabase.from("recipients").select("status").eq("campaign_id", id),
    supabase.from("email_queue").select("status,delivery_mode,attempts,max_attempts").eq("campaign_id", id),
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
  const scheduleEditable = !campaign.started_at && (queueResult.data?.length ?? 0) === 0;
  const scheduleInputValue = campaign.scheduled_at && campaign.schedule_timezone
    ? formatForDateTimeLocal(campaign.scheduled_at, campaign.schedule_timezone)
    : "";
  const emailMode = getEmailMode();

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

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="panel p-6">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Sender assignment</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Balance connected senders</h2>
          {(draftCountResult.count ?? 0) > 0 ? (
            <p className="mt-3 text-sm text-[#607580]">Assignment locked because stored previews already exist.</p>
          ) : connectedSenderResult.data?.length ? (
            <form action={assignCampaignSendersAction} className="mt-5 space-y-3">
              <input name="campaignId" type="hidden" value={id} />
              {connectedSenderResult.data.map((sender) => (
                <label className="flex items-center gap-3 rounded-lg border border-[#d4ddd9] px-4 py-3 text-sm" key={sender.id}>
                  <input defaultChecked name="senderId" type="checkbox" value={sender.id} />
                  <span><strong>{sender.display_name}</strong><span className="mono ml-2 text-xs text-[#607580]">{sender.email}</span></span>
                </label>
              ))}
              <button className="button-primary" type="submit">Assign evenly</button>
            </form>
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
            <form action={generateCampaignPreviewsAction}>
              <input name="campaignId" type="hidden" value={id} />
              <button className="button-primary" type="submit">Generate previews</button>
            </form>
            <Link className="rounded-md border border-[#c8d4d0] px-4 py-2 text-sm font-bold" href={`/campaigns/${id}/emails`}>Review emails</Link>
          </div>
        </article>
      </section>

      <section className="panel mt-8 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Server-side schedule</p>
            <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Queue approved emails</h2>
            {campaign.scheduled_at ? (
              <p className="mt-2 text-sm text-[#526873]">
                {formatInTimeZone(campaign.scheduled_at, scheduleTimezone)} · timezone: <strong>{scheduleTimezone}</strong>
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#526873]">No start time selected. Timezone will be stored with the UTC instant.</p>
            )}
          </div>
          <span className="mono rounded-full bg-[#e5edf2] px-3 py-1.5 text-[0.65rem] font-bold uppercase">
            {emailMode} mode
          </span>
        </div>

        {scheduleEditable ? (
          <form action={scheduleCampaignAction} className="mt-6 grid gap-4 lg:grid-cols-[10rem_1fr_1fr_auto] lg:items-end">
            <input name="campaignId" type="hidden" value={id} />
            <label className="text-sm font-bold">Start
              <select className="field mt-2" defaultValue={campaign.scheduled_at && futureSchedule ? "later" : "now"} name="scheduleMode">
                <option value="now">Send now</option>
                <option value="later">Schedule</option>
              </select>
            </label>
            <label className="text-sm font-bold">Local date and time
              <input className="field mt-2" defaultValue={scheduleInputValue} name="localDateTime" type="datetime-local" />
            </label>
            <label className="text-sm font-bold">Timezone
              <input className="field mt-2" defaultValue={scheduleTimezone} list="campaign-timezones" name="timezone" required />
              <datalist id="campaign-timezones">
                {['UTC', 'Asia/Manila', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Australia/Sydney'].map((zone) => <option key={zone} value={zone} />)}
              </datalist>
            </label>
            <button className="button-primary" type="submit">Save schedule</button>
          </form>
        ) : (
          <p className="mt-5 text-sm text-[#607580]">Schedule editing is locked because queue processing has started.</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {futureSchedule ? (
            <form action={cancelCampaignScheduleAction}>
              <input name="campaignId" type="hidden" value={id} />
              <button className="rounded-md border border-[#c8d4d0] px-4 py-2 text-sm font-bold" type="submit">Cancel future schedule</button>
            </form>
          ) : null}
          {campaign.scheduled_at && campaign.status !== "PAUSED" && campaign.status !== "COMPLETED" ? (
            <form action={pauseCampaignAction}>
              <input name="campaignId" type="hidden" value={id} />
              <button className="rounded-md border border-[#e4b76b] px-4 py-2 text-sm font-bold text-[#805516]" type="submit">Pause campaign</button>
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
