import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: campaigns, error: campaignError }, { data: recipients, error: recipientError }] =
    await Promise.all([
      supabase.from("campaigns").select("id,name,city,status,created_at,worksheet_name").order("created_at", { ascending: false }),
      supabase.from("recipients").select("campaign_id,status"),
    ]);

  if (campaignError || recipientError) {
    throw new Error("Campaigns could not be loaded from Supabase.");
  }

  const recipientCounts = new Map<string, number>();
  for (const recipient of recipients ?? []) {
    recipientCounts.set(recipient.campaign_id, (recipientCounts.get(recipient.campaign_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between gap-5">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Campaign register</p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Campaigns</h1>
        </div>
        <Link className="button-primary" href="/campaigns/new">New import</Link>
      </div>

      <div className="panel mt-8 overflow-hidden">
        {campaigns?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eaf0f2]">
                <tr className="mono text-[0.68rem] uppercase tracking-[0.12em] text-[#536d79]">
                  <th className="px-5 py-3 font-bold">Campaign</th>
                  <th className="px-5 py-3 font-bold">Source</th>
                  <th className="px-5 py-3 font-bold">Recipients</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr className="group relative border-t border-[#dce4e1] transition-colors hover:bg-[#f4f8f7]" key={campaign.id}>
                    <td className="px-5 py-4">
                      <Link
                        className="inline-flex items-center gap-2 font-extrabold text-[#17456f] after:absolute after:inset-0"
                        href={`/campaigns/${campaign.id}`}
                      >
                        {campaign.name}
                        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                      </Link>
                      <p className="mt-1 text-xs text-[#607580]">{campaign.city}</p>
                    </td>
                    <td className="mono px-5 py-4 text-xs">{campaign.worksheet_name ?? "—"}</td>
                    <td className="px-5 py-4 font-bold">{recipientCounts.get(campaign.id) ?? 0}</td>
                    <td className="px-5 py-4">
                      <span className="mono rounded-full bg-[#e5edf2] px-2 py-1 text-[0.65rem] font-bold">{campaign.status}</span>
                    </td>
                    <td className="px-5 py-4 text-[#607580]">
                      {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(campaign.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-lg font-extrabold">No campaigns yet.</p>
            <p className="mt-2 text-sm text-[#607580]">Preview a private Sheet and commit its recipients to begin.</p>
            <Link className="button-primary mt-5" href="/campaigns/new">Import recipients</Link>
          </div>
        )}
      </div>
    </div>
  );
}
