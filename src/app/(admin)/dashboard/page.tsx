import Link from "next/link";

import { DeliveryModeControl } from "@/components/delivery-mode-control";
import { QuickRunPanel } from "@/components/quick-run-panel";
import { requireAdmin } from "@/lib/auth/admin";
import {
  parseCampaignReadiness,
  readinessAction,
  unavailableCampaignReadiness,
} from "@/lib/campaigns/readiness";
import {
  formatTimeZoneLabel,
  getSupportedTimeZones,
} from "@/lib/scheduling/timezone";
import { getRuntimeDeliveryModeState } from "@/lib/settings/delivery-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DashboardPageProps = {
  searchParams: Promise<{ campaign?: string | string[]; notice?: string | string[] }>;
};

const noticeMessages: Record<string, { tone: string; message: string }> = {
  "mode-updated": { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Delivery mode updated and audit record saved." },
  "mode-constrained": { tone: "border-[#f1d6a6] bg-[#fff8e8] text-[#805516]", message: "Deployment EMAIL_MODE ceiling blocks that delivery mode." },
  "mode-invalid": { tone: "border-red-200 bg-red-50 text-red-800", message: "Invalid delivery mode rejected. Effective mode remains safe." },
  "mode-error": { tone: "border-red-200 bg-red-50 text-red-800", message: "Delivery mode could not be updated." },
  "quick-run-started": { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign start saved. Server worker will process eligible work." },
  "quick-run-scheduled": { tone: "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]", message: "Campaign schedule saved server-side." },
  "quick-run-blocked": { tone: "border-[#f1d6a6] bg-[#fff8e8] text-[#805516]", message: "Quick Run rejected because campaign readiness changed or processing already started." },
  "quick-run-invalid": { tone: "border-red-200 bg-red-50 text-red-800", message: "Quick Run date, time, timezone, or campaign selection is invalid." },
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await requireAdmin();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [campaignResult, recipientResult, connectedSenderResult, auditResult, deliveryState] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id,name,city,status,scheduled_at,schedule_timezone,paused_at,archived_at")
      .neq("status", "ARCHIVED")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("recipients").select("status"),
    supabase.from("sender_accounts").select("id", { count: "exact", head: true }).eq("status", "CONNECTED"),
    supabase
      .from("application_setting_audit")
      .select("id,previous_value,new_value,changed_by,changed_at")
      .order("changed_at", { ascending: false })
      .limit(5),
    getRuntimeDeliveryModeState(),
  ]);

  if (campaignResult.error || recipientResult.error || connectedSenderResult.error || auditResult.error) {
    throw new Error("Dashboard data could not be loaded from Supabase.");
  }

  const campaigns = campaignResult.data ?? [];
  const readinessResults = await Promise.all(
    campaigns.map((campaign) => supabase.rpc("get_campaign_readiness", { p_campaign_id: campaign.id })),
  );
  const campaignReadiness = campaigns.map((campaign, index) => ({
    id: campaign.id,
    name: campaign.name,
    city: campaign.city,
    scheduledAt: campaign.scheduled_at,
    readiness: readinessResults[index]?.error
      ? unavailableCampaignReadiness
      : parseCampaignReadiness(readinessResults[index]?.data),
  }));
  const readyCampaigns = campaignReadiness.filter((campaign) => campaign.readiness.ready);
  const blockedCampaigns = campaignReadiness.filter((campaign) => !campaign.readiness.ready);
  const scheduledCount = campaigns.filter((campaign) => (
    campaign.status === "READY" && campaign.scheduled_at
  )).length;
  const recipientCounts = new Map<string, number>();
  for (const recipient of recipientResult.data ?? []) {
    recipientCounts.set(recipient.status, (recipientCounts.get(recipient.status) ?? 0) + 1);
  }
  const timezoneOptions = getSupportedTimeZones().map((zone) => ({
    label: formatTimeZoneLabel(zone),
    value: zone,
  }));
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const currentNotice = notice ? noticeMessages[notice] : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Operations overview</p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Run outreach with safety visible.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526873]">
            Delivery mode, campaign readiness, schedules, sender health, and results in one admin view.
          </p>
        </div>
        <Link className="button-primary" href="/campaigns/new">Import campaign</Link>
      </div>

      {currentNotice ? (
        <p className={`mt-5 rounded-lg border px-4 py-3 text-sm font-bold ${currentNotice.tone}`} role="status">
          {currentNotice.message}
        </p>
      ) : null}

      <section aria-label="Outreach metrics" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Active campaigns", campaigns.length],
          ["Scheduled", scheduledCount],
          ["Ready", readyCampaigns.length],
          ["Sent", recipientCounts.get("SENT") ?? 0],
          ["Failed", recipientCounts.get("FAILED") ?? 0],
          ["Connected senders", connectedSenderResult.count ?? 0],
        ].map(([label, value]) => (
          <article className="panel relative overflow-hidden p-5" key={label}>
            <span className="absolute inset-y-0 left-0 w-1 bg-[#2563a6]" />
            <p className="mono text-[0.63rem] font-bold uppercase tracking-[0.1em] text-[#607580]">{label}</p>
            <p className="mt-3 text-3xl font-[800] tracking-[-0.04em]">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className={`panel p-6 sm:p-7 ${deliveryState.effectiveMode === "live" ? "border-red-300 ring-2 ring-red-100" : ""}`}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Delivery mode</p>
              <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">
                Effective mode: <span className={deliveryState.effectiveMode === "live" ? "text-red-700" : "text-[#17456f]"}>{deliveryState.effectiveMode.toUpperCase()}</span>
              </h2>
            </div>
            {deliveryState.source === "fail-closed" ? (
              <span className="mono rounded-full bg-red-100 px-3 py-1 text-[0.62rem] font-bold uppercase text-red-800">Fail-closed preview</span>
            ) : null}
          </div>
          <div className="mt-5">
            <DeliveryModeControl
              currentMode={deliveryState.effectiveMode}
              deploymentMode={deliveryState.deploymentMode}
            />
          </div>
          {deliveryState.constrainedByDeployment ? (
            <p className="mt-4 rounded-lg border border-[#f1d6a6] bg-[#fff8e8] px-4 py-3 text-xs font-bold text-[#805516]">
              Stored mode is {deliveryState.storedMode?.toUpperCase() ?? "UNKNOWN"}; deployment ceiling forces {deliveryState.effectiveMode.toUpperCase()}.
            </p>
          ) : null}
        </article>

        <article className="panel p-6 sm:p-7">
          <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Quick actions</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Common admin work</h2>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {[
              ["Import campaign", "/campaigns/new"],
              ["Open campaigns", "/campaigns"],
              ["Review emails", readyCampaigns[0] ? `/campaigns/${readyCampaigns[0].id}/emails` : "/campaigns"],
              ["Manage senders", "/senders"],
              ["Manage templates", "/templates"],
              ["Suppression list", "/suppression"],
            ].map(([label, href]) => (
              <Link className="rounded-lg border border-[#d4ddd9] bg-white px-3 py-3 text-sm font-bold hover:border-[#2563a6] hover:text-[#17456f]" href={href} key={label}>
                {label}
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="panel mt-8 p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Quick Run</p>
            <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Ready campaign → intentional start</h2>
            <p className="mt-2 text-sm text-[#526873]">Uses existing readiness, schedule, queue, suppression, locking, and duplicate guards.</p>
          </div>
          <span className={`mono self-start rounded-full px-3 py-1.5 text-[0.65rem] font-bold uppercase ${deliveryState.effectiveMode === "live" ? "bg-red-600 text-white" : "bg-[#e5edf2]"}`}>
            {deliveryState.effectiveMode} mode
          </span>
        </div>
        <div className="mt-6">
          <QuickRunPanel
            campaigns={readyCampaigns}
            deliveryMode={deliveryState.effectiveMode}
            timezoneOptions={timezoneOptions}
          />
        </div>
      </section>

      {blockedCampaigns.length ? (
        <section className="panel mt-8 overflow-hidden">
          <div className="border-b border-[#d4ddd9] px-6 py-5">
            <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Campaign readiness</p>
            <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">What needs attention</h2>
          </div>
          <div className="divide-y divide-[#dce4e1]">
            {blockedCampaigns.slice(0, 5).map((campaign) => (
              <article className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_1.3fr_auto] md:items-start" key={campaign.id}>
                <div>
                  <Link className="font-extrabold text-[#17456f] hover:underline" href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                  <p className="mt-1 text-xs text-[#607580]">{campaign.city}</p>
                </div>
                <ul className="space-y-1 text-sm text-[#805516]">
                  {campaign.readiness.blockingReasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
                {(() => {
                  const action = readinessAction(campaign.readiness.blockingReasons[0] ?? "");
                  if (!action) return <Link className="text-sm font-bold text-[#2563a6]" href={`/campaigns/${campaign.id}`}>Open campaign →</Link>;
                  const href = action.href === "emails" ? `/campaigns/${campaign.id}/emails` : action.href;
                  return <Link className="text-sm font-bold text-[#2563a6]" href={href}>{action.label} →</Link>;
                })()}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="panel p-6 sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Private data route</p>
              <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Sheet access stops at server.</h2>
            </div>
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-[#35a06f] shadow-[0_0_0_5px_#d9eee5]" />
          </div>
          <p className="mt-5 text-sm leading-6 text-[#526873]">
            Sender Gmail accounts receive no Sheet, campaign, recipient, template, dashboard, or database access.
          </p>
        </article>

        <article className="panel p-6 sm:p-7">
          <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Mode audit</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Recent changes</h2>
          {auditResult.data?.length ? (
            <ul className="mt-5 space-y-3">
              {auditResult.data.map((entry) => (
                <li className="rounded-lg bg-[#eef4f7] px-4 py-3 text-sm" key={entry.id}>
                  <strong className="mono uppercase">{entry.previous_value} → {entry.new_value}</strong>
                  <span className="mt-1 block text-xs text-[#607580]">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.changed_at))} · admin {entry.changed_by.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-[#607580]">No runtime mode changes yet.</p>
          )}
        </article>
      </section>
    </div>
  );
}
