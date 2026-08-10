"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { quickRunCampaignAction } from "@/app/(admin)/dashboard/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TimezoneSelect } from "@/components/timezone-select";
import type { CampaignRunReadiness } from "@/lib/campaigns/runs";
import type { EmailMode } from "@/lib/env";

type QuickRunCampaign = {
  id: string;
  name: string;
  city: string;
  status: string;
  recipientCount: number;
  latestRunStatus: string | null;
  readiness: CampaignRunReadiness;
};

type QuickRunSender = { id: string; displayName: string; email: string | null; status: "CONNECTED" };

type QuickRunPanelProps = {
  campaigns: QuickRunCampaign[];
  senders: QuickRunSender[];
  deliveryMode: EmailMode;
  batchSize: number;
  timezoneOptions: Array<{ label: string; value: string }>;
};

export function QuickRunPanel({ campaigns, senders, deliveryMode, batchSize, timezoneOptions }: QuickRunPanelProps) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [executionType, setExecutionType] = useState<"now" | "schedule">("now");
  const [senderStrategy, setSenderStrategy] = useState<"single" | "balanced">("single");
  const [singleSenderId, setSingleSenderId] = useState(senders[0]?.id ?? "");
  const [balancedSenderIds, setBalancedSenderIds] = useState(() => senders.slice(0, 2).map((sender) => sender.id));
  const [runScope, setRunScope] = useState<"all" | "failed">("all");
  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId) ?? campaigns[0],
    [campaignId, campaigns],
  );
  const statusLabel = (campaign: QuickRunCampaign) => campaign.latestRunStatus
    ?? (campaign.status === "DRAFT" ? "Needs attention" : campaign.status);

  if (!selected) {
    return <div className="rounded-xl border border-dashed border-[#c8d4d0] bg-[#f8faf9] px-5 py-8 text-center text-sm text-[#607580]">No campaign can start a new run.</div>;
  }

  const eligibleCount = runScope === "failed" ? selected.readiness.failedEligibleCount : selected.readiness.allEligibleCount;
  const senderCount = senderStrategy === "single" ? (singleSenderId ? 1 : 0) : balancedSenderIds.length;
  const scheduleLabel = executionType === "now" ? "Now" : "Selected date and time";
  const rerun = Boolean(selected.latestRunStatus);
  const confirmation = `${deliveryMode === "live" ? "REAL EMAILS WILL BE SENT.\n\n" : ""}${rerun ? "Run campaign again?" : "Start campaign run?"}\n\nCampaign: ${selected.name}\nPrevious run: ${selected.latestRunStatus ?? "None"}\nNew run: ${eligibleCount} eligible recipients\nScope: ${runScope === "all" ? "All eligible recipients" : "Failed recipients only"}\nSender strategy: ${senderStrategy}\nSenders: ${senderCount}\nMode: ${deliveryMode}\nBatch size: ${batchSize} per sender\nSchedule: ${scheduleLabel}\n\nThis creates a new campaign run. Previous send history remains unchanged.${runScope === "all" && rerun ? "\n\nWARNING: Previously SENT recipients may be included." : ""}`;

  function toggleBalancedSender(senderId: string) {
    setBalancedSenderIds((current) => current.includes(senderId)
      ? current.filter((id) => id !== senderId)
      : [...current, senderId]);
  }

  return (
    <form action={quickRunCampaignAction} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block text-sm font-bold">
          Campaign
          <select className="field mt-2 min-h-12 cursor-pointer" name="campaignId" onChange={(event) => setCampaignId(event.target.value)} value={selected.id}>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.city} · {statusLabel(campaign)} · {campaign.recipientCount} recipients</option>
            ))}
          </select>
        </label>
        <Link className="button-secondary min-h-12" href={`/campaigns/${selected.id}`}>Open campaign →</Link>
      </div>

      <div className="rounded-xl border-2 border-[#2563a6] bg-[#eef4f7] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><strong>{selected.name}</strong><span className="ml-2 text-sm text-[#526873]">{selected.city}</span></div>
          <span className="mono rounded-full bg-white px-3 py-1 text-[0.65rem] font-bold uppercase text-[#17456f]">{statusLabel(selected)}</span>
        </div>
        <p className="mt-2 text-xs text-[#607580]">{selected.recipientCount} recipients · {selected.readiness.allEligibleCount} all-run eligible · {selected.readiness.failedEligibleCount} retry eligible</p>
      </div>

      <fieldset>
        <legend className="text-sm font-bold">Recipient scope</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={runScope === "all"} className="mr-2" name="runScope" onChange={() => setRunScope("all")} type="radio" value="all" />All eligible recipients ({selected.readiness.allEligibleCount})</label>
          <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={runScope === "failed"} className="mr-2" disabled={!selected.readiness.canRetryFailed} name="runScope" onChange={() => setRunScope("failed")} type="radio" value="failed" />Failed recipients only ({selected.readiness.failedEligibleCount})</label>
        </div>
        {runScope === "all" && rerun ? <p className="mt-2 text-xs font-bold text-red-700">Warning: may include recipients sent in previous runs. Confirmation required.</p> : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold">Sender strategy</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={senderStrategy === "single"} className="mr-2" name="senderStrategy" onChange={() => setSenderStrategy("single")} type="radio" value="single" />Single sender</label>
          <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={senderStrategy === "balanced"} className="mr-2" disabled={senders.length < 2} name="senderStrategy" onChange={() => setSenderStrategy("balanced")} type="radio" value="balanced" />Balance selected senders</label>
        </div>
        {senderStrategy === "single" ? (
          <label className="mt-3 block text-sm font-bold">Sender
            <select className="field mt-2 min-h-12" name="senderId" onChange={(event) => setSingleSenderId(event.target.value)} required value={singleSenderId}>
              {senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} — {sender.email} — Connected</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {senders.map((sender) => (
              <label className="flex items-center gap-3 rounded-lg border border-[#d4ddd9] bg-white px-4 py-3 text-sm" key={sender.id}>
                <input checked={balancedSenderIds.includes(sender.id)} name="senderId" onChange={() => toggleBalancedSender(sender.id)} type="checkbox" value={sender.id} />
                <span><strong>{sender.displayName}</strong><span className="mono block text-xs text-[#607580]">{sender.email} · Connected</span></span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold">Start</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-[#eef4f7] p-1.5">
          <button aria-pressed={executionType === "now"} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${executionType === "now" ? "bg-white text-[#17456f] shadow-sm" : "text-[#526873]"}`} onClick={() => setExecutionType("now")} type="button">Run now</button>
          <button aria-pressed={executionType === "schedule"} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${executionType === "schedule" ? "bg-white text-[#17456f] shadow-sm" : "text-[#526873]"}`} onClick={() => setExecutionType("schedule")} type="button">Schedule</button>
        </div>
      </fieldset>
      <input name="executionType" type="hidden" value={executionType} />
      {executionType === "schedule" ? <div className="grid gap-4 sm:grid-cols-2 sm:items-start"><label className="text-sm font-bold">Local date and time<input className="field mt-2 min-h-12" name="localDateTime" required type="datetime-local" /></label><TimezoneSelect initialValue={null} options={timezoneOptions} /></div> : null}

      <div className={`rounded-lg border px-4 py-3 text-sm ${deliveryMode === "live" ? "border-red-300 bg-red-50 text-red-900" : "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]"}`}><strong className="uppercase">{deliveryMode} mode</strong><span className="ml-2">Batch size: {batchSize} per connected sender per worker execution.</span></div>
      {selected.readiness.blocked.length ? <details className="rounded-lg border border-[#f1d6a6] bg-[#fff8e8] px-4 py-3 text-sm"><summary className="cursor-pointer font-bold">{selected.readiness.blocked.length} blocked failed recipient(s)</summary><ul className="mt-2 space-y-1">{selected.readiness.blocked.slice(0, 8).map((item) => <li key={item.email}>{item.email}: {item.reason}</li>)}</ul></details> : null}

      <ConfirmSubmitButton className={deliveryMode === "live" ? "inline-flex min-h-12 items-center justify-center rounded-[0.65rem] bg-red-600 px-5 font-extrabold text-white hover:bg-red-700" : "button-primary min-h-12"} confirmation={confirmation} disabled={senderCount === 0 || eligibleCount === 0 || selected.readiness.activeRun || (senderStrategy === "balanced" && senderCount < 2)}>
        {runScope === "failed" ? "Retry failed emails" : rerun ? "Run again" : executionType === "now" ? "Run campaign" : "Schedule campaign"}
      </ConfirmSubmitButton>
    </form>
  );
}
