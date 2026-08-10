"use client";

import { useState } from "react";

import { assignCampaignSendersAction } from "@/app/(admin)/campaigns/[id]/actions";

type Sender = { id: string; displayName: string; email: string | null };

export function SenderAssignmentControl({ campaignId, senders, initialSenderIds }: { campaignId: string; senders: Sender[]; initialSenderIds: string[] }) {
  const initial = initialSenderIds.filter((id) => senders.some((sender) => sender.id === id));
  const [strategy, setStrategy] = useState<"single" | "balanced">(initial.length === 1 ? "single" : "balanced");
  const [selected, setSelected] = useState(initial.length ? initial : senders.map((sender) => sender.id));

  function chooseStrategy(next: "single" | "balanced") {
    setStrategy(next);
    setSelected(next === "single" ? senders.slice(0, 1).map((sender) => sender.id) : senders.slice(0, 2).map((sender) => sender.id));
  }

  return <form action={assignCampaignSendersAction} className="mt-5 space-y-3">
    <input name="campaignId" type="hidden" value={campaignId} />
    <div className="grid grid-cols-2 gap-2">
      <label className="rounded-lg border border-[#d4ddd9] p-3 text-sm"><input checked={strategy === "single"} className="mr-2" name="senderStrategy" onChange={() => chooseStrategy("single")} type="radio" value="single" />Single</label>
      <label className="rounded-lg border border-[#d4ddd9] p-3 text-sm"><input checked={strategy === "balanced"} className="mr-2" disabled={senders.length < 2} name="senderStrategy" onChange={() => chooseStrategy("balanced")} type="radio" value="balanced" />Balanced</label>
    </div>
    {strategy === "single" ? <select className="field min-h-12" name="senderId" onChange={(event) => setSelected([event.target.value])} value={selected[0] ?? ""}>{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} — {sender.email}</option>)}</select> : senders.map((sender) => <label className="flex items-center gap-3 rounded-lg border border-[#d4ddd9] px-4 py-3 text-sm" key={sender.id}><input checked={selected.includes(sender.id)} name="senderId" onChange={() => setSelected((current) => current.includes(sender.id) ? current.filter((id) => id !== sender.id) : [...current, sender.id])} type="checkbox" value={sender.id} /><span><strong>{sender.displayName}</strong><span className="mono ml-2 text-xs text-[#607580]">{sender.email}</span></span></label>)}
    <button className="button-primary" disabled={selected.length === 0 || (strategy === "balanced" && selected.length < 2)} type="submit">{strategy === "single" ? "Assign single sender" : "Assign evenly"}</button>
  </form>;
}
