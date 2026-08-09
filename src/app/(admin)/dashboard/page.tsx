import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const trackedStatuses = ["PENDING", "APPROVED", "SENT", "FAILED"] as const;

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const [campaignResult, recipientResult] = await Promise.all([
    supabase.from("campaigns").select("id", { count: "exact", head: true }),
    supabase.from("recipients").select("status"),
  ]);

  if (campaignResult.error || recipientResult.error) {
    throw new Error("Dashboard data could not be loaded from Supabase.");
  }

  const counts = Object.fromEntries(
    trackedStatuses.map((status) => [
      status,
      (recipientResult.data ?? []).filter((recipient) => recipient.status === status).length,
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Operations overview</p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Recipient intake, at a glance.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526873]">
            Secure intake, connected senders, deterministic templates, and approval-ready email previews.
          </p>
        </div>
        <Link className="button-primary" href="/campaigns/new">
          Import a campaign
        </Link>
      </div>

      <section aria-label="Campaign metrics" className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Campaigns", campaignResult.count ?? 0],
          ["Pending", counts.PENDING ?? 0],
          ["Approved", counts.APPROVED ?? 0],
          ["Sent", counts.SENT ?? 0],
          ["Failed", counts.FAILED ?? 0],
        ].map(([label, value]) => (
          <article className="panel relative overflow-hidden p-5" key={label}>
            <span className="absolute inset-y-0 left-0 w-1 bg-[#2563a6]" />
            <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">{label}</p>
            <p className="mt-3 text-3xl font-[800] tracking-[-0.04em]">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="panel p-6 sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Private data route</p>
              <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Sheet access stops at the server.</h2>
            </div>
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-[#35a06f] shadow-[0_0_0_5px_#d9eee5]" />
          </div>
          <div className="mono mt-7 grid gap-3 text-xs sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div className="rounded-lg bg-[#eef4f7] p-3">Private Sheet</div>
            <span className="hidden text-[#ed7b3a] sm:block">→</span>
            <div className="rounded-lg border-2 border-[#ed7b3a] bg-white p-3">Server reader</div>
            <span className="hidden text-[#ed7b3a] sm:block">→</span>
            <div className="rounded-lg bg-[#eef4f7] p-3">Supabase</div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[#526873]">
            Only the dedicated service account receives read access. Sender Gmail accounts never receive Sheet, dashboard, or recipient access.
          </p>
        </article>

        <article className="panel p-6 sm:p-7">
          <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">Current boundary</p>
          <h2 className="mt-2 text-2xl font-[780] tracking-[-0.035em]">Preview mode stays non-sending.</h2>
          <ul className="mt-5 space-y-3 text-sm text-[#526873]">
            <li className="flex gap-3"><span className="font-black text-[#2563a6]">✓</span> Admin auth and RLS active</li>
            <li className="flex gap-3"><span className="font-black text-[#2563a6]">✓</span> Sheet preview before commit</li>
            <li className="flex gap-3"><span className="font-black text-[#2563a6]">✓</span> Duplicate recipients blocked</li>
            <li className="flex gap-3"><span className="font-black text-[#2563a6]">✓</span> Gmail OAuth connection only</li>
            <li className="flex gap-3"><span className="font-black text-[#ed7b3a]">—</span> Gmail draft/send deferred to Phase 7</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
