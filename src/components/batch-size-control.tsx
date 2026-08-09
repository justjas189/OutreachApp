"use client";

import { useRef, useState } from "react";

import { setEmailBatchSizeAction } from "@/app/(admin)/dashboard/actions";
import type { EmailMode } from "@/lib/env";
import {
  EMAIL_BATCH_SIZE_MAX,
  EMAIL_BATCH_SIZE_MIN,
  isHighImpactLiveBatchIncrease,
  LIVE_BATCH_CONFIRMATION_DELTA,
} from "@/lib/settings/batch-size-shared";

type BatchSizeControlProps = {
  currentBatchSize: number;
  deliveryMode: EmailMode;
  source: "database" | "environment-fallback";
};

export function BatchSizeControl({ currentBatchSize, deliveryMode, source }: BatchSizeControlProps) {
  const [value, setValue] = useState(String(currentBatchSize));
  const confirmationInput = useRef<HTMLInputElement>(null);

  function adjust(delta: number) {
    const parsed = Number(value);
    const current = Number.isInteger(parsed) ? parsed : currentBatchSize;
    setValue(String(Math.min(EMAIL_BATCH_SIZE_MAX, Math.max(EMAIL_BATCH_SIZE_MIN, current + delta))));
  }

  function confirmLiveIncrease(event: React.FormEvent<HTMLFormElement>) {
    if (confirmationInput.current) confirmationInput.current.value = "false";
    const next = Number(value);
    if (!Number.isInteger(next) || next < EMAIL_BATCH_SIZE_MIN || next > EMAIL_BATCH_SIZE_MAX) return;
    if (deliveryMode !== "live" || !isHighImpactLiveBatchIncrease(currentBatchSize, next)) return;

    const confirmed = window.confirm(
      `Increase Live batch size to ${next}?\n\nUp to ${next} eligible emails per connected sender may be processed during each worker execution. Total work can be higher when multiple senders are connected.\n\nProvider limits and all queue safety checks still apply.`,
    );
    if (!confirmed) {
      event.preventDefault();
      return;
    }
    if (confirmationInput.current) confirmationInput.current.value = "true";
  }

  return (
    <form action={setEmailBatchSizeAction} className="mt-6 border-t border-[#dce4e1] pt-6" onSubmit={confirmLiveIncrease}>
      <input defaultValue="false" name="liveChangeConfirmed" ref={confirmationInput} type="hidden" />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <label className="block text-sm font-extrabold" htmlFor="email-batch-size">
            Emails processed per worker batch
          </label>
          <p className="mt-1 max-w-xl text-xs leading-5 text-[#607580]">
            Limit applies per connected sender during each worker execution. Larger values process more queue items but never bypass provider limits or safety checks.
          </p>
        </div>
        <div className="grid grid-cols-[3rem_6rem_3rem] items-center gap-2 sm:flex">
          <button
            aria-label="Decrease email batch size"
            className="grid size-12 place-items-center rounded-lg border border-[#c8d4d0] bg-white text-xl font-black disabled:opacity-40"
            disabled={Number(value) <= EMAIL_BATCH_SIZE_MIN}
            onClick={() => adjust(-1)}
            type="button"
          >
            −
          </button>
          <input
            className="field h-12 w-24 text-center text-lg font-extrabold"
            id="email-batch-size"
            inputMode="numeric"
            max={EMAIL_BATCH_SIZE_MAX}
            min={EMAIL_BATCH_SIZE_MIN}
            name="batchSize"
            onChange={(event) => setValue(event.target.value)}
            required
            step="1"
            type="number"
            value={value}
          />
          <button
            aria-label="Increase email batch size"
            className="grid size-12 place-items-center rounded-lg border border-[#c8d4d0] bg-white text-xl font-black disabled:opacity-40"
            disabled={Number(value) >= EMAIL_BATCH_SIZE_MAX}
            onClick={() => adjust(1)}
            type="button"
          >
            +
          </button>
          <button className="button-primary col-span-3 min-h-12 w-full sm:w-auto" type="submit">Save</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#607580]">
        Current: <strong>{currentBatchSize} per sender per worker execution</strong>. Allowed: {EMAIL_BATCH_SIZE_MIN}–{EMAIL_BATCH_SIZE_MAX}.
        {source === "environment-fallback" ? " Using EMAIL_BATCH_SIZE environment fallback." : " Runtime database setting active."}
        {deliveryMode === "live" ? ` Live increases of ${LIVE_BATCH_CONFIRMATION_DELTA}+ require confirmation.` : ""}
      </p>
    </form>
  );
}
