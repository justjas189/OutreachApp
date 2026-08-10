import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RichTextEditor } from "@/components/rich-text-editor";
import { getPagination } from "@/lib/pagination";
import { plainTextToHtml, sanitizeRichHtml } from "@/lib/templates/rich-text";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  approveAllEmailPreviewsAction,
  approveEmailPreviewAction,
  regenerateEmailPreviewAction,
  saveEmailPreviewAction,
} from "../actions";

export const metadata: Metadata = { title: "Review email previews" };

type EmailReviewPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }>;
};

export default async function EmailReviewPage({ params, searchParams }: EmailReviewPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const [campaignResult, countResult, generatedResult, approvedResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,city,status,started_at,archived_at").eq("id", id).maybeSingle(),
    supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "GENERATED"),
    supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "APPROVED"),
  ]);
  if (campaignResult.error || countResult.error || generatedResult.error || approvedResult.error) {
    throw new Error("Email previews could not be loaded.");
  }
  if (!campaignResult.data) notFound();

  const pagination = getPagination(query.page, countResult.count ?? 0, 10);
  const { data: drafts, error: draftError } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .range(pagination.from, pagination.to);
  if (draftError) throw new Error("Email previews could not be loaded.");

  const recipientIds = [...new Set((drafts ?? []).map((draft) => draft.recipient_id))];
  const senderIds = [...new Set((drafts ?? []).map((draft) => draft.sender_account_id).filter((value): value is string => Boolean(value)))];
  const [recipientResult, senderResult] = await Promise.all([
    recipientIds.length
      ? supabase.from("recipients").select("id,name,email,business_type").in("id", recipientIds)
      : Promise.resolve({ data: [], error: null }),
    senderIds.length
      ? supabase.from("sender_accounts").select("id,display_name,email").in("id", senderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recipientResult.error || senderResult.error) throw new Error("Email preview details could not be loaded.");
  const recipients = new Map((recipientResult.data ?? []).map((recipient) => [recipient.id, recipient]));
  const senders = new Map((senderResult.data ?? []).map((sender) => [sender.id, sender]));
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const campaignEditable = campaignResult.data.status !== "ARCHIVED"
    && !campaignResult.data.archived_at
    && !campaignResult.data.started_at;

  return (
    <div className="mx-auto max-w-6xl">
      <Link className="text-sm font-bold text-[#2563a6] hover:underline" href={`/campaigns/${id}`}>← Back to campaign</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Stored previews only</p>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Review email previews</h1>
          <p className="mt-2 text-sm text-[#526873]">{campaignResult.data.name} · {campaignResult.data.city}</p>
        </div>
        {campaignEditable && (generatedResult.count ?? 0) > 0 ? (
          <form action={approveAllEmailPreviewsAction}>
            <input name="campaignId" type="hidden" value={id} />
            <button className="button-primary" type="submit">Approve all generated</button>
          </form>
        ) : null}
      </div>

      {notice === "generated" ? (
        <p className="mt-5 rounded-lg border border-[#bfd8ca] bg-[#eef8f2] px-4 py-3 text-sm font-bold text-[#1f6e4c]">Email previews generated and stored. Gmail was not called.</p>
      ) : null}

      {!campaignEditable ? (
        <p className="mt-5 rounded-lg border border-[#c8d4d0] bg-[#f4f7f6] px-4 py-3 text-sm font-bold text-[#526873]">
          Read-only history. Email editing and approval are disabled after processing starts or when a campaign is archived.
        </p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[["Total", countResult.count ?? 0], ["Generated", generatedResult.count ?? 0], ["Approved", approvedResult.count ?? 0]].map(([label, value]) => (
          <article className="panel p-5" key={label}><p className="mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#607580]">{label}</p><p className="mt-2 text-2xl font-[800]">{value}</p></article>
        ))}
      </section>

      <section className="mt-6 space-y-5">
        {drafts?.map((draft) => {
          const recipient = recipients.get(draft.recipient_id);
          const sender = draft.sender_account_id ? senders.get(draft.sender_account_id) : null;
          const editable = campaignEditable && draft.status === "GENERATED";
          return (
            <article className="panel overflow-hidden" key={draft.id}>
              <div className="flex flex-col justify-between gap-3 border-b border-[#d4ddd9] bg-[#f8faf9] px-6 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-extrabold">{recipient?.name ?? "Unknown recipient"}</p>
                  <p className="mono mt-1 text-xs text-[#607580]">{recipient?.email} · {recipient?.business_type}</p>
                  <p className="mono mt-1 text-xs text-[#607580]">Sender: {sender?.display_name ?? "Unavailable"} {sender?.email ? `· ${sender.email}` : ""}</p>
                </div>
                <span className={`mono self-start rounded-full px-2.5 py-1 text-[0.64rem] font-bold sm:self-auto ${draft.status === "APPROVED" ? "bg-[#d9eee5] text-[#1f6e4c]" : "bg-[#e5edf2] text-[#526873]"}`}>{draft.status}</span>
              </div>
              <form className="space-y-4 p-6">
                <input name="draftId" type="hidden" value={draft.id} />
                <input name="campaignId" type="hidden" value={id} />
                <label className="block text-sm font-bold">Subject<input className="field mt-2" defaultValue={draft.subject} maxLength={200} name="subject" readOnly={!editable} required /></label>
                <RichTextEditor
                  initialHtml={sanitizeRichHtml(draft.body_html ?? plainTextToHtml(draft.body))}
                  label="Email body"
                  name="bodyHtml"
                  readOnly={!editable}
                />
                {editable ? (
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-md border border-[#c8d4d0] px-4 py-2 text-sm font-bold" formAction={saveEmailPreviewAction} type="submit">Save changes</button>
                    <button className="button-primary" formAction={approveEmailPreviewAction} type="submit">Approve</button>
                  </div>
                ) : null}
              </form>
              {editable ? (
                <form action={regenerateEmailPreviewAction} className="border-t border-[#d4ddd9] px-6 py-4">
                  <input name="draftId" type="hidden" value={draft.id} />
                  <input name="campaignId" type="hidden" value={id} />
                  <button className="text-xs font-bold text-[#2563a6] hover:underline" type="submit">Regenerate from current template</button>
                </form>
              ) : null}
            </article>
          );
        })}
        {!drafts?.length ? <div className="panel px-6 py-16 text-center text-sm text-[#607580]">No stored email previews yet.</div> : null}
      </section>

      {pagination.pageCount > 1 ? (
        <nav className="mt-6 flex justify-between" aria-label="Email preview pages">
          {pagination.page > 1 ? <Link className="button-primary" href={`/campaigns/${id}/emails?page=${pagination.page - 1}`}>← Previous</Link> : <span />}
          {pagination.page < pagination.pageCount ? <Link className="button-primary" href={`/campaigns/${id}/emails?page=${pagination.page + 1}`}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
