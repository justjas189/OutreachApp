"use client";

import { useState } from "react";

import { createCampaignRunAction } from "@/app/(admin)/campaigns/[id]/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TimezoneSelect } from "@/components/timezone-select";
import type { CampaignRunReadiness } from "@/lib/campaigns/runs";
import type { EmailMode } from "@/lib/env";

type Sender = { id: string; displayName: string; email: string | null };

export function CampaignRunControl({
  campaignId,
  campaignName,
  latestRunStatus,
  readiness,
  senders,
  deliveryMode,
  batchSize,
  timezoneOptions,
}: {
  campaignId: string;
  campaignName: string;
  latestRunStatus: string | null;
  readiness: CampaignRunReadiness;
  senders: Sender[];
  deliveryMode: EmailMode;
  batchSize: number;
  timezoneOptions: Array<{ label: string; value: string }>;
}) {
  const [strategy, setStrategy] = useState<"single" | "balanced">("single");
  const [senderIds, setSenderIds] = useState(() => senders.slice(0, 1).map((sender) => sender.id));
  const [scope, setScope] = useState<"all" | "failed">(readiness.canRetryFailed && !readiness.canRunAll ? "failed" : "all");
  const [executionType, setExecutionType] = useState<"now" | "schedule">("now");
  const eligible = scope === "failed" ? readiness.failedEligibleCount : readiness.allEligibleCount;
  const confirmation = `${deliveryMode === "live" ? "REAL EMAILS WILL BE SENT.\n\n" : ""}${latestRunStatus ? "Run campaign again?" : "Start campaign run?"}\n\n${campaignName}\nPrevious run: ${latestRunStatus ?? "None"}\nNew run: ${eligible} eligible recipients\nScope: ${scope === "all" ? "All eligible recipients" : "Failed recipients only"}\nMode: ${deliveryMode}\nSender strategy: ${strategy}\n\nThis creates a new campaign run. Previous send history remains unchanged.${scope === "all" && latestRunStatus ? "\n\nWARNING: Previously SENT recipients may be included." : ""}`;

  function chooseStrategy(next: "single" | "balanced") {
    setStrategy(next);
    setSenderIds(next === "single" ? senders.slice(0, 1).map((sender) => sender.id) : senders.slice(0, 2).map((sender) => sender.id));
  }

  return (
    <form action={createCampaignRunAction} className="mt-5 space-y-5">
      <input name="campaignId" type="hidden" value={campaignId} />
      <fieldset><legend className="text-sm font-bold">Recipients</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={scope === "all"} className="mr-2" name="runScope" onChange={() => setScope("all")} type="radio" value="all" />All eligible ({readiness.allEligibleCount})</label>
        <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={scope === "failed"} className="mr-2" disabled={!readiness.canRetryFailed} name="runScope" onChange={() => setScope("failed")} type="radio" value="failed" />Failed only ({readiness.failedEligibleCount})</label>
      </div></fieldset>
      <fieldset><legend className="text-sm font-bold">Sender strategy</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={strategy === "single"} className="mr-2" name="senderStrategy" onChange={() => chooseStrategy("single")} type="radio" value="single" />Single sender</label>
        <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm"><input checked={strategy === "balanced"} className="mr-2" disabled={senders.length < 2} name="senderStrategy" onChange={() => chooseStrategy("balanced")} type="radio" value="balanced" />Balance selected</label>
      </div></fieldset>
      {strategy === "single" ? <select className="field min-h-12" name="senderId" onChange={(event) => setSenderIds([event.target.value])} required value={senderIds[0] ?? ""}>{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} — {sender.email} — Connected</option>)}</select> : <div className="grid gap-2 sm:grid-cols-2">{senders.map((sender) => <label className="rounded-lg border border-[#d4ddd9] bg-white p-3 text-sm" key={sender.id}><input checked={senderIds.includes(sender.id)} className="mr-2" name="senderId" onChange={() => setSenderIds((current) => current.includes(sender.id) ? current.filter((id) => id !== sender.id) : [...current, sender.id])} type="checkbox" value={sender.id} />{sender.displayName}<span className="mono ml-2 text-xs text-[#607580]">{sender.email}</span></label>)}</div>}
      <fieldset><legend className="text-sm font-bold">Start</legend><div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-[#eef4f7] p-1.5"><button aria-pressed={executionType === "now"} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${executionType === "now" ? "bg-white shadow-sm" : "text-[#526873]"}`} onClick={() => setExecutionType("now")} type="button">Run now</button><button aria-pressed={executionType === "schedule"} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${executionType === "schedule" ? "bg-white shadow-sm" : "text-[#526873]"}`} onClick={() => setExecutionType("schedule")} type="button">Schedule</button></div></fieldset>
      <input name="executionType" type="hidden" value={executionType} />
      {executionType === "schedule" ? <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Local date and time<input className="field mt-2 min-h-12" name="localDateTime" required type="datetime-local" /></label><TimezoneSelect initialValue={null} options={timezoneOptions} /></div> : null}
      {readiness.blocked.length ? <details className="rounded-lg border border-[#f1d6a6] bg-[#fff8e8] p-3 text-sm"><summary className="cursor-pointer font-bold">{readiness.blocked.length} blocked failure(s)</summary>{readiness.blocked.map((item) => <p className="mt-1" key={item.email}>{item.email}: {item.reason}</p>)}</details> : null}
      <p className="text-xs font-bold text-[#607580]">{deliveryMode.toUpperCase()} · batch {batchSize} per sender · new immutable run</p>
      <ConfirmSubmitButton className={deliveryMode === "live" ? "rounded-md bg-red-600 px-5 py-3 font-extrabold text-white" : "button-primary"} confirmation={confirmation} disabled={readiness.activeRun || eligible === 0 || senderIds.length === 0 || (strategy === "balanced" && senderIds.length < 2)}>{scope === "failed" ? "Retry failed emails" : latestRunStatus ? "Run again" : "Run campaign"}</ConfirmSubmitButton>
    </form>
  );
}
