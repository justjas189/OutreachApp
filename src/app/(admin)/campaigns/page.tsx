import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Campaigns" };

type CampaignsPageProps = {
  searchParams: Promise<{ notice?: string | string[]; view?: string | string[] }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const query = await searchParams;
  const viewValue = Array.isArray(query.view) ? query.view[0] : query.view;
  const view = viewValue === "archived" ? "archived" : "active";
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const supabase = await createSupabaseServerClient();
  const [{ data: campaigns, error: campaignError }, { data: recipients, error: recipientError }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id,name,city,status,created_at,archived_at,worksheet_name")
        .order("created_at", { ascending: false }),
      supabase.from("recipients").select("campaign_id,status"),
    ]);

  if (campaignError || recipientError) throw new Error("Campaigns could not be loaded from Supabase.");

  const statusCounts = new Map<string, Map<string, number>>();
  for (const recipient of recipients ?? []) {
    const campaignCounts = statusCounts.get(recipient.campaign_id) ?? new Map<string, number>();
    campaignCounts.set(recipient.status, (campaignCounts.get(recipient.status) ?? 0) + 1);
    statusCounts.set(recipient.campaign_id, campaignCounts);
  }

  const activeCampaigns = (campaigns ?? []).filter((campaign) => campaign.status !== "ARCHIVED" && !campaign.archived_at);
  const archivedCampaigns = (campaigns ?? []).filter((campaign) => campaign.status === "ARCHIVED" || campaign.archived_at);
  const visibleCampaigns = view === "archived" ? archivedCampaigns : activeCampaigns;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between gap-5">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Campaign register</p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Campaigns</h1>
        </div>
        <Link className="button-primary" href="/campaigns/new">Create campaign</Link>
      </div>

      {notice === "deleted" ? (
        <p className="mt-5 rounded-lg border border-[#bfd8ca] bg-[#eef8f2] px-4 py-3 text-sm font-bold text-[#1f6e4c]" role="status">
          Never-sent campaign and its safe owned records were permanently deleted.
        </p>
      ) : null}

      <nav aria-label="Campaign views" className="mt-7 flex gap-2">
        <Link className={`rounded-md px-4 py-2 text-sm font-bold ${view === "active" ? "bg-[#17456f] text-white" : "border border-[#c8d4d0]"}`} href="/campaigns">
          Active · {activeCampaigns.length}
        </Link>
        <Link className={`rounded-md px-4 py-2 text-sm font-bold ${view === "archived" ? "bg-[#17456f] text-white" : "border border-[#c8d4d0]"}`} href="/campaigns?view=archived">
          Archived / History · {archivedCampaigns.length}
        </Link>
      </nav>

      <div className="panel mt-5 overflow-hidden">
        {visibleCampaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
              <thead className="bg-[#eaf0f2]">
                <tr className="mono text-[0.68rem] uppercase tracking-[0.12em] text-[#536d79]">
                  <th className="px-5 py-3 font-bold">Campaign</th>
                  <th className="px-5 py-3 font-bold">Source</th>
                  <th className="px-5 py-3 font-bold">Recipients</th>
                  <th className="px-5 py-3 font-bold">Approved</th>
                  <th className="px-5 py-3 font-bold">Sent</th>
                  <th className="px-5 py-3 font-bold">Failed</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">{view === "archived" ? "Archived" : "Created"}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => {
                  const counts = statusCounts.get(campaign.id) ?? new Map<string, number>();
                  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
                  return (
                    <tr className="group relative border-t border-[#dce4e1] transition-colors hover:bg-[#f4f8f7]" key={campaign.id}>
                      <td className="px-5 py-4">
                        <Link className="inline-flex items-center gap-2 font-extrabold text-[#17456f] after:absolute after:inset-0" href={`/campaigns/${campaign.id}`}>
                          {campaign.name}<span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                        </Link>
                        <p className="mt-1 text-xs text-[#607580]">{campaign.city}</p>
                      </td>
                      <td className="mono px-5 py-4 text-xs">{campaign.worksheet_name ?? "—"}</td>
                      <td className="px-5 py-4 font-bold">{total}</td>
                      <td className="px-5 py-4">{counts.get("APPROVED") ?? 0}</td>
                      <td className="px-5 py-4">{counts.get("SENT") ?? 0}</td>
                      <td className="px-5 py-4">{counts.get("FAILED") ?? 0}</td>
                      <td className="px-5 py-4"><span className="mono rounded-full bg-[#e5edf2] px-2 py-1 text-[0.65rem] font-bold">{campaign.status}</span></td>
                      <td className="px-5 py-4 text-[#607580]">
                        {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(view === "archived" ? campaign.archived_at! : campaign.created_at))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-lg font-extrabold">{view === "archived" ? "No archived campaign history." : "No active campaigns yet."}</p>
            <p className="mt-2 text-sm text-[#607580]">
              {view === "archived" ? "Campaigns with sending history appear here after archive." : "Preview a private Sheet and commit its recipients to begin."}
            </p>
            {view === "active" ? <Link className="button-primary mt-5" href="/campaigns/new">Import recipients</Link> : null}
          </div>
        )}
      </div>
    </div>
  );
}
