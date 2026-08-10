"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/submit-button";

import {
  createSenderInviteAction,
} from "./actions";
import { initialInviteActionState } from "./action-state";

type PendingSender = { id: string; displayName: string };

export function SenderInviteForm({ initialRequestKey, pendingSenders }: { initialRequestKey: string; pendingSenders: PendingSender[] }) {
  const [state, action] = useActionState(createSenderInviteAction, initialInviteActionState);
  const [copied, setCopied] = useState(false);
  const [senderAccountId, setSenderAccountId] = useState("new");
  const requestKey = state.nextRequestKey ?? initialRequestKey;

  const selectedSender = pendingSenders.find((sender) => sender.id === senderAccountId);

  async function copyInvite() {
    if (!state.inviteUrl) return;
    await navigator.clipboard.writeText(state.inviteUrl);
    setCopied(true);
  }

  return (
    <form action={action} className="panel p-6">
      <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">
        New one-time connection
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-bold">Sender
          <select className="field mt-2" onChange={(event) => setSenderAccountId(event.target.value)} value={senderAccountId}>
            <option value="new">Create new sender</option>
            {pendingSenders.map((sender) => <option key={sender.id} value={sender.id}>Re-invite {sender.displayName}</option>)}
          </select>
        </label>
        {selectedSender ? (
          <label className="text-sm font-bold">Sender label<input className="field mt-2 bg-[#eef4f7]" readOnly value={selectedSender.displayName} /></label>
        ) : (
          <label className="text-sm font-bold">Sender label<input className="field mt-2" maxLength={120} name="senderLabel" placeholder="Account 1" required /></label>
        )}
        <input name="actionType" type="hidden" value={selectedSender ? "reinvite" : "create"} />
        {selectedSender ? <input name="senderId" type="hidden" value={selectedSender.id} /> : null}
        <input name="requestKey" type="hidden" value={requestKey} />
        <SubmitButton pendingLabel="Creating…">Create invite</SubmitButton>
      </div>
      {selectedSender ? <p className="mt-3 text-xs text-[#607580]">Reuses existing sender card. Any previous unused connection link becomes invalid.</p> : null}
      {state.error ? (
        <p className="mt-3 text-sm font-bold text-red-800" role="alert">{state.error}</p>
      ) : null}
      {state.inviteUrl ? (
        <div className="mt-5 rounded-xl border border-[#bfd8ca] bg-[#eef8f2] p-4">
          <p className="text-sm font-bold">Copy now. Raw token is never stored and cannot be shown again.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className="field mono text-xs" readOnly value={state.inviteUrl} />
            <button className="button-primary" onClick={copyInvite} type="button">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[#607580]">
            Expires {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.expiresAt!))}.
          </p>
        </div>
      ) : null}
    </form>
  );
}
