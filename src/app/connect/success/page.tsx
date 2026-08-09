import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gmail connected", referrer: "no-referrer" };

export default function SenderConnectionSuccessPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="panel w-full max-w-lg p-8 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#d9eee5] text-2xl font-black text-[#1f6e4c]">✓</span>
        <h1 className="mt-5 text-3xl font-[800] tracking-[-0.04em]">Gmail connected successfully.</h1>
        <p className="mt-3 text-sm text-[#526873]">You may close this page.</p>
      </section>
    </main>
  );
}
