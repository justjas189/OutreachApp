import type { Metadata } from "next";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { renameSenderAction, revokeSenderAction } from "./actions";
import { SenderInviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Sender accounts" };

export default async function SendersPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: senders, error: senderError }, { data: invites, error: inviteError }] =
    await Promise.all([
      supabase.from("sender_accounts").select("*").order("created_at", { ascending: true }),
      supabase.from("sender_invites").select("*").order("created_at", { ascending: false }),
    ]);

  if (senderError || inviteError) throw new Error("Sender accounts could not be loaded.");
  const latestInvite = new Map<string, (typeof invites)[number]>();
  for (const invite of invites ?? []) {
    if (invite.sender_account_id && !latestInvite.has(invite.sender_account_id)) {
      latestInvite.set(invite.sender_account_id, invite);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Gmail authorization</p>
        <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Sender accounts</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526873]">
          Senders receive only expiring connection links. They never receive dashboard, Sheet, campaign, recipient, or template access.
        </p>
      </div>

      <div className="mt-8"><SenderInviteForm /></div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {senders?.map((sender) => {
          const invite = latestInvite.get(sender.id);
          const inviteState = invite?.used_at
            ? "Used"
            : invite && new Date(invite.expires_at) > new Date()
              ? "Awaiting connection"
              : "Expired";
          return (
            <article className="panel p-6" key={sender.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-extrabold">{sender.display_name}</p>
                  <p className="mono mt-1 text-xs text-[#607580]">{sender.email ?? "Gmail not connected"}</p>
                </div>
                <span className={`mono rounded-full px-2.5 py-1 text-[0.64rem] font-bold ${sender.status === "CONNECTED" ? "bg-[#d9eee5] text-[#1f6e4c]" : "bg-[#e5edf2] text-[#526873]"}`}>
                  {sender.status}
                </span>
              </div>
              <p className="mt-4 text-xs text-[#607580]">Latest invite: {inviteState}</p>
              <div className="mt-5 flex flex-col gap-3 border-t border-[#d4ddd9] pt-4 sm:flex-row">
                <form action={renameSenderAction} className="flex flex-1 gap-2">
                  <input name="senderId" type="hidden" value={sender.id} />
                  <input className="field" defaultValue={sender.display_name} maxLength={120} name="senderLabel" required />
                  <button className="rounded-md border border-[#c8d4d0] px-3 text-xs font-bold" type="submit">Rename</button>
                </form>
                {sender.status === "CONNECTED" ? (
                  <form action={revokeSenderAction}>
                    <input name="senderId" type="hidden" value={sender.id} />
                    <button className="rounded-md border border-red-200 px-3 py-3 text-xs font-bold text-red-800" type="submit">Revoke</button>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
