import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { SubmitButton } from "@/components/submit-button";
import type { EmailMode } from "@/lib/env";

type AdminShellProps = {
  adminEmail: string;
  emailMode: EmailMode;
  children: React.ReactNode;
};

const navigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/campaigns/new", label: "Import recipients" },
  { href: "/templates", label: "Templates" },
  { href: "/senders", label: "Senders" },
  { href: "/suppression", label: "Suppression" },
];

export function AdminShell({ adminEmail, emailMode, children }: AdminShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]" data-delivery-mode={emailMode}>
      <aside className={`border-b border-white/10 bg-[#11202c] text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r ${emailMode === "live" ? "shadow-[inset_-5px_0_0_#dc2626]" : ""}`}>
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-6 lg:py-7">
          <Link className="flex items-center gap-3" href="/dashboard">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-sm font-black text-[#11202c]">RC</span>
            <span>
              <span className="block font-extrabold">Rip City Outreach</span>
              <span className="mono block text-[0.62rem] uppercase tracking-[0.17em] text-white/50">Admin desk</span>
            </span>
          </Link>
          <div className="mt-0 flex items-center gap-2 lg:mt-8 lg:block">
            {emailMode === "live" ? (
              <span className="mono inline-flex rounded-full bg-red-500 px-2.5 py-1 text-[0.63rem] font-bold uppercase tracking-[0.12em] text-white">
                Live mode
              </span>
            ) : emailMode === "draft" ? (
              <span className="mono inline-flex rounded-full bg-[#ed7b3a] px-2.5 py-1 text-[0.63rem] font-bold uppercase tracking-[0.12em] text-white">
                Draft mode
              </span>
            ) : (
              <span className="mono inline-flex rounded-full bg-[#35a06f] px-2.5 py-1 text-[0.63rem] font-bold uppercase tracking-[0.12em] text-white">
                Preview mode
              </span>
            )}
          </div>
        </div>

        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:px-4 lg:pb-0">
          {navigation.map((item) => (
            <Link
              className="block whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white/10 hover:text-white"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:absolute lg:inset-x-4 lg:bottom-5 lg:block">
          <div className="border-t border-white/15 pt-4">
            <p className="truncate text-xs text-white/55">{adminEmail}</p>
            <form action={logoutAction} className="mt-3">
              <SubmitButton
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10"
                pendingLabel="Signing out…"
              >
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        {emailMode === "live" ? (
          <div className="mx-auto mb-6 max-w-6xl rounded-xl border-2 border-red-500 bg-red-50 px-5 py-3 text-sm font-extrabold text-red-900" role="alert">
            LIVE MODE · REAL APPROVED EMAIL MAY BE SENT. Allowlist, suppression, queue, and lifecycle protections remain active.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
