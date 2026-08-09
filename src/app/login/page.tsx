import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOptionalAdmin } from "@/lib/auth/admin";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function LoginPage() {
  if (await getOptionalAdmin()) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#11202c] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-y-0 left-0 w-2 bg-[#ed7b3a]" />
        <div>
          <p className="mono text-xs font-semibold uppercase tracking-[0.22em] text-[#9ec3df]">
            Rip City Review / Operations
          </p>
          <h1 className="mt-7 max-w-xl text-5xl font-[780] leading-[1.06] tracking-[-0.045em]">
            Outreach data stays behind one controlled desk.
          </h1>
        </div>
        <div className="max-w-xl border-t border-white/20 pt-7">
          <div className="mono grid grid-cols-[7rem_1fr] gap-y-3 text-xs uppercase tracking-[0.12em]">
            <span className="text-white/45">Recipients</span>
            <span>Private Google Sheet → server import</span>
            <span className="text-white/45">Access</span>
            <span>Verified admin session + database RLS</span>
            <span className="text-white/45">Email mode</span>
            <span>Preview by default</span>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="panel w-full max-w-md p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#11202c] font-black text-white">RC</span>
            <div>
              <p className="font-extrabold">Rip City Outreach</p>
              <p className="mono text-[0.68rem] uppercase tracking-[0.15em] text-[#607580]">Admin console</p>
            </div>
          </div>
          <h2 className="mt-9 text-3xl font-[780] tracking-[-0.035em]">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-[#526873]">
            Use an account assigned the admin role in Supabase Auth.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
