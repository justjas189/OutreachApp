"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import type { ImportedRecipient } from "@/lib/google-sheets/schema";

import {
  commitCampaignAction,
  previewSheetAction,
} from "./actions";

import {
  initialCommitState,
  initialPreviewState,
} from "./action-state";

function RecipientPreviewTable({
  recipients,
  pageSize,
}: {
  recipients: ImportedRecipient[];
  pageSize: number;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(recipients.length / pageSize);
  const visibleRecipients = recipients.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#eaf0f2]">
            <tr className="mono text-[0.65rem] uppercase tracking-[0.1em] text-[#536d79]">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Link</th>
              <th className="px-5 py-3">Business type</th>
            </tr>
          </thead>
          <tbody>
            {visibleRecipients.map((recipient) => (
              <tr className="border-t border-[#dce4e1]" key={recipient.email}>
                <td className="px-5 py-3 font-bold">{recipient.name}</td>
                <td className="mono px-5 py-3 text-xs">{recipient.email}</td>
                <td className="max-w-72 truncate px-5 py-3 text-[#2563a6]">{recipient.link}</td>
                <td className="px-5 py-3">{recipient.business_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-[#d4ddd9] px-6 py-3 text-xs">
          <button
            className="rounded-md border border-[#c8d4d0] px-3 py-1.5 font-bold disabled:opacity-40"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="mono text-[#607580]">Page {page + 1} of {pageCount}</span>
          <button
            className="rounded-md border border-[#c8d4d0] px-3 py-1.5 font-bold disabled:opacity-40"
            disabled={page === pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </>
  );
}

export function ImportWizard() {
  const [previewState, previewAction] = useActionState(previewSheetAction, initialPreviewState);
  const [commitState, commitAction] = useActionState(commitCampaignAction, initialCommitState);

  return (
    <div className="space-y-6">
      <form action={previewAction} className="panel p-6 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">01 / Campaign</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="campaignName">Campaign name</label>
                <input className="field" defaultValue={previewState.source?.campaignName} id="campaignName" name="campaignName" placeholder="Best Makeup Artists in Portland" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="city">City</label>
                <input className="field" defaultValue={previewState.source?.city} id="city" name="city" placeholder="Portland" required />
              </div>
            </div>
          </div>

          <div className="border-t border-[#d4ddd9] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">02 / Private Sheet</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="sheetInput">Google Sheet URL or Spreadsheet ID</label>
                <input className="field mono text-sm" defaultValue={previewState.source?.sheetInput} id="sheetInput" name="sheetInput" placeholder="https://docs.google.com/spreadsheets/d/…" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold" htmlFor="worksheetName">Worksheet name <span className="font-normal text-[#607580]">(optional)</span></label>
                <input className="field" defaultValue={previewState.source?.worksheetName} id="worksheetName" name="worksheetName" placeholder="First worksheet when blank" />
              </div>
            </div>
          </div>
        </div>

        {previewState.error ? (
          <div aria-live="polite" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-bold">{previewState.error}</p>
            {previewState.details.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {previewState.details.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#d4ddd9] pt-5">
          <p className="text-xs leading-5 text-[#607580]">Read-only request. Nothing is saved during preview.</p>
          <SubmitButton pendingLabel="Reading Sheet…">Preview recipients</SubmitButton>
        </div>
      </form>

      {previewState.preview && previewState.source ? (
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-4 border-b border-[#d4ddd9] px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <p className="mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#607580]">03 / Verify recipients</p>
              <h2 className="mt-1 text-2xl font-[780] tracking-[-0.035em]">{previewState.preview.recipientCount} unique recipients</h2>
              <p className="mt-1 text-xs text-[#607580]">
                Worksheet: <span className="mono">{previewState.source.resolvedWorksheetName}</span>
                {previewState.preview.duplicateCount > 0 ? ` · ${previewState.preview.duplicateCount} duplicate rows skipped` : " · no duplicates"}
              </p>
            </div>
            <span className="mono self-start rounded-full bg-[#d9eee5] px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.11em] text-[#1f6e4c] sm:self-auto">Schema valid</span>
          </div>

          <RecipientPreviewTable
            key={`${previewState.source.spreadsheetId}:${previewState.source.resolvedWorksheetName}:${previewState.preview.recipientCount}`}
            pageSize={previewState.preview.pageSize}
            recipients={previewState.preview.recipients}
          />

          <form action={commitAction} className="border-t border-[#d4ddd9] bg-[#f8faf9] px-6 py-5">
            <input name="campaignName" type="hidden" value={previewState.source.campaignName} />
            <input name="city" type="hidden" value={previewState.source.city} />
            <input name="sheetInput" type="hidden" value={previewState.source.sheetInput} />
            <input name="worksheetName" type="hidden" value={previewState.source.resolvedWorksheetName} />
            {commitState.error ? (
              <p aria-live="polite" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{commitState.error}</p>
            ) : null}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <p className="max-w-2xl text-xs leading-5 text-[#607580]">
                Commit re-reads the private Sheet server-side, then creates campaign and recipients in one database transaction. Every normalized recipient is available in the paginated preview.
              </p>
              <SubmitButton pendingLabel="Verifying and importing…">Commit campaign</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
