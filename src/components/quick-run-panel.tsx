"use client";

import { useMemo, useState } from "react";

import { quickRunCampaignAction } from "@/app/(admin)/dashboard/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TimezoneSelect } from "@/components/timezone-select";
import type { CampaignReadiness } from "@/lib/campaigns/readiness";
import type { EmailMode } from "@/lib/env";

type QuickRunCampaign = {
  id: string;
  name: string;
  city: string;
  readiness: CampaignReadiness;
};

type QuickRunPanelProps = {
  campaigns: QuickRunCampaign[];
  deliveryMode: EmailMode;
  timezoneOptions: Array<{ label: string; value: string }>;
};

export function QuickRunPanel({ campaigns, deliveryMode, timezoneOptions }: QuickRunPanelProps) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId) ?? campaigns[0],
    [campaignId, campaigns],
  );

  if (!selected) {
    return (
      <div className="rounded-xl border border-dashed border-[#c8d4d0] bg-[#f8faf9] px-5 py-8 text-center text-sm text-[#607580]">
        No campaign is ready. Fix readiness items below, then return here.
      </div>
    );
  }

  const readiness = selected.readiness;
  const scheduleLabel = scheduleMode === "now" ? "Now" : "Selected date and time";
  const confirmation = `${deliveryMode === "live" ? "REAL EMAILS WILL BE SENT.\n\n" : ""}Ready to run\n\nCampaign: ${selected.name}\nMode: ${deliveryMode}\nApproved: ${readiness.approvedCount}\nSenders: ${readiness.connectedSenderCount}\nSuppressed: ${readiness.suppressedCount}\nSchedule: ${scheduleLabel}`;

  return (
    <form action={quickRunCampaignAction} className="space-y-5">
      <label className="block text-sm font-bold">
        Campaign
        <select
          className="field mt-2 min-h-12"
          name="campaignId"
          onChange={(event) => setCampaignId(event.target.value)}
          value={selected.id}
        >
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.city}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Recipients", readiness.recipientCount],
          ["Senders", readiness.connectedSenderCount],
          ["Generated", readiness.generatedCount],
          ["Approved", readiness.approvedCount],
          ["Suppressed", readiness.suppressedCount],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-[#eef4f7] p-3" key={label}>
            <p className="mono text-[0.58rem] uppercase text-[#607580]">{label}</p>
            <p className="mt-1 text-xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <fieldset>
        <legend className="text-sm font-bold">Start</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-[#eef4f7] p-1.5">
          <button
            aria-pressed={scheduleMode === "now"}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold ${scheduleMode === "now" ? "bg-white text-[#17456f] shadow-sm" : "text-[#526873]"}`}
            onClick={() => setScheduleMode("now")}
            type="button"
          >
            Run now
          </button>
          <button
            aria-pressed={scheduleMode === "later"}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold ${scheduleMode === "later" ? "bg-white text-[#17456f] shadow-sm" : "text-[#526873]"}`}
            onClick={() => setScheduleMode("later")}
            type="button"
          >
            Schedule
          </button>
        </div>
      </fieldset>
      <input name="scheduleMode" type="hidden" value={scheduleMode} />

      {scheduleMode === "later" ? (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <label className="text-sm font-bold">
            Local date and time
            <input className="field mt-2 min-h-12" name="localDateTime" required type="datetime-local" />
          </label>
          <TimezoneSelect initialValue={null} options={timezoneOptions} />
        </div>
      ) : (
        <TimezoneSelect initialValue={null} options={timezoneOptions} />
      )}

      <div className={`rounded-lg border px-4 py-3 text-sm ${deliveryMode === "live" ? "border-red-300 bg-red-50 text-red-900" : "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]"}`}>
        <strong className="uppercase">{deliveryMode} mode</strong>
        <span className="ml-2">
          {deliveryMode === "preview" ? "Schedule is saved; Gmail remains untouched." : deliveryMode === "draft" ? "Only Gmail drafts will be created." : "Real eligible email can be sent."}
        </span>
      </div>

      <ConfirmSubmitButton
        className={deliveryMode === "live"
          ? "inline-flex min-h-12 items-center justify-center rounded-[0.65rem] bg-red-600 px-5 font-extrabold text-white hover:bg-red-700"
          : "button-primary min-h-12"}
        confirmation={confirmation}
      >
        {scheduleMode === "now" ? "Run campaign" : "Schedule campaign"}
      </ConfirmSubmitButton>
    </form>
  );
}
