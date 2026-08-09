import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gmail connection unavailable", referrer: "no-referrer" };

export default function SenderConnectionErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="panel w-full max-w-lg p-8 text-center sm:p-10">
        <h1 className="text-3xl font-[800] tracking-[-0.04em]">Gmail connection was not completed.</h1>
        <p className="mt-4 text-sm leading-6 text-[#526873]">
          Link may be expired, already used, or authorization may have been cancelled. Ask administrator for a new connection link.
        </p>
      </section>
    </main>
  );
}
