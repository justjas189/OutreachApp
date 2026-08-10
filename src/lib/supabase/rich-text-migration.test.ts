import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810180328_rich_text_email_templates.sql", "utf8");

describe("rich email migration", () => {
  it("stores nullable HTML beside legacy text through template, draft, and immutable run snapshot", () => {
    expect(sql).toContain("alter table public.templates");
    expect(sql).toContain("alter table public.email_drafts");
    expect(sql).toContain("alter table public.campaign_run_recipients");
    expect(sql).toContain("campaign_run_recipients_copy_html");
  });

  it("returns rich HTML only through service-role queue preparation", () => {
    expect(sql).toContain("body_html text,encrypted_refresh_token text");
    expect(sql).toContain("revoke all on function public.prepare_claimed_email(uuid,uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.prepare_claimed_email(uuid,uuid) to service_role");
  });
});
