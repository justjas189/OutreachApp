import type { Metadata } from "next";

import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import recipients" };

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Private recipient intake</p>
        <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Preview, verify, then commit.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526873]">
          Required columns: <span className="mono">NAME</span>, <span className="mono">EMAIL</span>, <span className="mono">LINK</span>, and <span className="mono">Business Type</span>. Access runs only through the server-side service account.
        </p>
      </div>
      <div className="mt-8">
        <ImportWizard />
      </div>
    </div>
  );
}
