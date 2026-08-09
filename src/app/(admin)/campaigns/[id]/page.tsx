import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPagination } from "@/lib/pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Campaign details" };

type CampaignDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSafeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: CampaignDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const [campaignResult, countResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id,name,city,status,created_at,google_sheet_id,worksheet_name")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id),
  ]);

  if (campaignResult.error || countResult.error) {
    throw new Error("Campaign details could not be loaded from Supabase.");
  }

  if (!campaignResult.data) {
    notFound();
  }

  const recipientCount = countResult.count ?? 0;
  const pagination = getPagination(query.page, recipientCount);
  const { data: recipients, error: recipientError } = await supabase
    .from("recipients")
    .select("id,name,email,link,business_type,status,created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(pagination.from, pagination.to);

  if (recipientError) {
    throw new Error("Campaign recipients could not be loaded from Supabase.");
  }

  const campaign = campaignResult.data;
  const createdAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(campaign.created_at));
  const sheetUrl = campaign.google_sheet_id
    ? `https://docs.google.com/spreadsheets/d/${campaign.google_sheet_id}`
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link className="text-sm font-bold text-[#2563a6] hover:underline" href="/campaigns">
        ← Back to campaigns
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">
            Campaign details
          </p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">{campaign.name}</h1>
          <p className="mt-2 text-[#526873]">{campaign.city}</p>
        </div>
        <span className="mono self-start rounded-full bg-[#e5edf2] px-3 py-1.5 text-[0.68rem] font-bold tracking-[0.08em]">
          {campaign.status}
        </span>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Created</p>
          <p className="mt-2 text-sm font-bold">{createdAt}</p>
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Recipients</p>
          <p className="mt-2 text-2xl font-[800]">{recipientCount}</p>
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Google Sheet source</p>
          {sheetUrl ? (
            <a
              className="mono mt-2 block truncate text-xs font-bold text-[#2563a6] hover:underline"
              href={sheetUrl}
              rel="noreferrer"
              target="_blank"
              title={campaign.google_sheet_id ?? undefined}
            >
              {campaign.google_sheet_id}
            </a>
          ) : (
            <p className="mt-2 text-sm text-[#607580]">Not recorded</p>
          )}
        </article>
        <article className="panel p-5">
          <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Worksheet</p>
          <p className="mono mt-2 truncate text-sm font-bold">{campaign.worksheet_name ?? "Not recorded"}</p>
        </article>
      </section>

      <section className="panel mt-8 overflow-hidden">
        <div className="flex items-end justify-between gap-4 border-b border-[#d4ddd9] px-5 py-5 sm:px-6">
          <div>
            <p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">Imported recipients</p>
            <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">Recipient list</h2>
          </div>
          <p className="mono text-xs text-[#607580]">
            Page {pagination.page} / {pagination.pageCount}
          </p>
        </div>

        {recipients?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
              <thead className="bg-[#eaf0f2]">
                <tr className="mono text-[0.65rem] uppercase tracking-[0.1em] text-[#536d79]">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Link</th>
                  <th className="px-5 py-3">Business Type</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => {
                  const safeLink = getSafeLink(recipient.link);
                  return (
                    <tr className="border-t border-[#dce4e1]" key={recipient.id}>
                      <td className="px-5 py-4 font-extrabold">{recipient.name}</td>
                      <td className="mono px-5 py-4 text-xs">{recipient.email}</td>
                      <td className="max-w-64 px-5 py-4">
                        {safeLink ? (
                          <a
                            className="block truncate text-[#2563a6] hover:underline"
                            href={safeLink}
                            rel="noreferrer"
                            target="_blank"
                            title={recipient.link}
                          >
                            {recipient.link}
                          </a>
                        ) : (
                          <span className="block truncate text-[#526873]" title={recipient.link}>
                            {recipient.link}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">{recipient.business_type}</td>
                      <td className="px-5 py-4">
                        <span className="mono rounded-full bg-[#e5edf2] px-2 py-1 text-[0.65rem] font-bold">
                          {recipient.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center text-sm text-[#607580]">
            No recipients imported for this campaign.
          </div>
        )}

        {pagination.pageCount > 1 ? (
          <nav
            aria-label="Recipient pages"
            className="flex items-center justify-between border-t border-[#d4ddd9] bg-[#f8faf9] px-5 py-4 sm:px-6"
          >
            {pagination.page > 1 ? (
              <Link
                className="rounded-md border border-[#c8d4d0] px-3 py-1.5 text-xs font-bold hover:bg-white"
                href={`/campaigns/${id}?page=${pagination.page - 1}`}
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {pagination.page < pagination.pageCount ? (
              <Link
                className="rounded-md border border-[#c8d4d0] px-3 py-1.5 text-xs font-bold hover:bg-white"
                href={`/campaigns/${id}?page=${pagination.page + 1}`}
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
