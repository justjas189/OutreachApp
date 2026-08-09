import Link from "next/link";

export default function CampaignNotFound() {
  return (
    <div className="panel mx-auto max-w-xl px-7 py-14 text-center">
      <p className="mono text-xs font-bold uppercase tracking-[0.16em] text-[#607580]">Campaign not found</p>
      <h1 className="mt-3 text-3xl font-[800] tracking-[-0.04em]">This campaign is unavailable.</h1>
      <p className="mt-3 text-sm leading-6 text-[#526873]">
        It may not exist, or current admin session cannot access it.
      </p>
      <Link className="button-primary mt-6" href="/campaigns">
        Return to campaigns
      </Link>
    </div>
  );
}
