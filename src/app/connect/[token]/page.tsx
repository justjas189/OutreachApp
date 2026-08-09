import type { Metadata } from "next";

import { SubmitButton } from "@/components/submit-button";
import { getSenderInviteConnection } from "@/lib/senders/invites";

import { startGmailOAuthAction } from "./actions";

export const metadata: Metadata = {
  title: "Connect Gmail",
  referrer: "no-referrer",
};

export default async function ConnectSenderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getSenderInviteConnection(token);
  const available = invite?.availability === "AVAILABLE";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="panel w-full max-w-lg p-7 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#11202c] font-black text-white">AR</span>
        <p className="mono mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#607580]">AtlasReach</p>
        <h1 className="mt-3 text-3xl font-[800] tracking-[-0.04em]">Connect your Gmail account</h1>
        {available ? (
          <>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#526873]">
              Authorize this application to use Gmail as an approved sender for Rip City Review.
            </p>
            <form action={startGmailOAuthAction} className="mt-7">
              <input name="token" type="hidden" value={token} />
              <SubmitButton pendingLabel="Opening Google…">Connect Gmail</SubmitButton>
            </form>
            <p className="mt-5 text-xs leading-5 text-[#607580]">
              This link grants no dashboard, Sheet, campaign, recipient, or template access.
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-lg border border-[#d4ddd9] bg-[#f3f6f4] px-4 py-3 text-sm text-[#526873]">
            This connection link is invalid, expired, or already used. Ask the administrator for a new link.
          </p>
        )}
      </section>
    </main>
  );
}
