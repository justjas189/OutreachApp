import type { Metadata } from "next";
import Link from "next/link";

import { getPagination } from "@/lib/pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { addSuppressionAction, removeSuppressionAction } from "./actions";

export const metadata: Metadata = { title: "Suppression list" };

type SuppressionPageProps = {
  searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }>;
};

export default async function SuppressionPage({ searchParams }: SuppressionPageProps) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { count, error: countError } = await supabase.from("suppression_list").select("id", { count: "exact", head: true });
  if (countError) throw new Error("Suppression list could not be loaded.");
  const pagination = getPagination(query.page, count ?? 0, 25);
  const { data: entries, error } = await supabase
    .from("suppression_list")
    .select("id,email,reason,source,created_at")
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);
  if (error) throw new Error("Suppression list could not be loaded.");
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const messages: Record<string, string> = {
    added: "Email suppressed. Any unsent matching queue work was cancelled.",
    removed: "Suppression entry removed. Existing SUPPRESSED recipient states remain unchanged for safety.",
    invalid: "Enter a valid email and suppression reason.",
    error: "Suppression change could not be saved.",
  };

  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Phase 8</p>
      <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Suppression list</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526873]">Manual STOP, unsubscribe, invalid-address, and block entries. Suppression is checked during generation, enqueue, and immediately before every Gmail operation.</p>

      {notice && messages[notice] ? (
        <p className={`mt-5 rounded-lg border px-4 py-3 text-sm font-bold ${notice === "added" || notice === "removed" ? "border-[#bfd8ca] bg-[#eef8f2] text-[#1f6e4c]" : "border-red-200 bg-red-50 text-red-800"}`} role="status">{messages[notice]}</p>
      ) : null}

      <section className="panel mt-7 p-6">
        <h2 className="text-xl font-extrabold">Add manual suppression</h2>
        <form action={addSuppressionAction} className="mt-5 grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <label className="text-sm font-bold">Email
            <input autoComplete="off" className="field mt-2" name="email" placeholder="recipient@example.com" required type="email" />
          </label>
          <label className="text-sm font-bold">Reason
            <select className="field mt-2" defaultValue="MANUAL BLOCK" name="reason">
              <option>STOP</option><option>UNSUBSCRIBED</option><option>INVALID</option><option>MANUAL BLOCK</option>
            </select>
          </label>
          <button className="button-primary" type="submit">Suppress</button>
        </form>
      </section>

      <section className="panel mt-7 overflow-hidden">
        <div className="flex items-end justify-between border-b border-[#d4ddd9] px-6 py-5">
          <div><p className="mono text-[0.65rem] uppercase text-[#607580]">Manual controls</p><h2 className="mt-1 text-2xl font-extrabold">{count ?? 0} suppressed emails</h2></div>
          <p className="mono text-xs text-[#607580]">Page {pagination.page} / {pagination.pageCount}</p>
        </div>
        {entries?.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-[#eaf0f2]"><tr className="mono text-[0.65rem] uppercase text-[#536d79]"><th className="px-5 py-3">Email</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Added</th><th className="px-5 py-3">Action</th></tr></thead>
            <tbody>{entries.map((entry) => <tr className="border-t border-[#dce4e1]" key={entry.id}>
              <td className="mono px-5 py-4 text-xs font-bold">{entry.email}</td><td className="px-5 py-4">{entry.reason}</td><td className="px-5 py-4">{entry.source}</td><td className="px-5 py-4">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(entry.created_at))}</td>
              <td className="px-5 py-4"><form action={removeSuppressionAction}><input name="suppressionId" type="hidden" value={entry.id} /><button className="text-xs font-bold text-red-700 hover:underline" type="submit">Remove</button></form></td>
            </tr>)}</tbody>
          </table></div>
        ) : <p className="px-6 py-14 text-center text-sm text-[#607580]">No suppressed emails.</p>}
        {pagination.pageCount > 1 ? <nav aria-label="Suppression pages" className="flex justify-between border-t border-[#d4ddd9] px-6 py-4">
          {pagination.page > 1 ? <Link className="button-primary" href={`/suppression?page=${pagination.page - 1}`}>← Previous</Link> : <span />}
          {pagination.page < pagination.pageCount ? <Link className="button-primary" href={`/suppression?page=${pagination.page + 1}`}>Next →</Link> : <span />}
        </nav> : null}
      </section>
    </div>
  );
}
