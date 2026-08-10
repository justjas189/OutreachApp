import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(admin)/senders/page.tsx"), "utf8");
const actions = readFileSync(join(process.cwd(), "src/app/(admin)/senders/actions.ts"), "utf8");

describe("expired pending sender deletion UI", () => {
  it("shows Delete only from server-reported eligibility and requires confirmation", () => {
    expect(page).toContain("get_pending_sender_delete_eligibility");
    expect(page).toContain("deleteState?.eligible");
    expect(page).toContain("Delete pending sender?");
    expect(page).toContain("has never been connected and its latest invite is expired");
    expect(page).toContain("Its current invitation will immediately become invalid");
    expect(page).toContain("ConfirmSubmitButton");
  });

  it("supports new logical senders and explicit re-invites without extra cards", () => {
    expect(page).toContain("pendingSenders=");
    expect(page).toContain('sender.status === "PENDING"');
    expect(actions).toContain('supabase.rpc("create_or_reinvite_sender"');
  });

  it("submits an explicit create or re-invite contract", () => {
    const form = readFileSync(join(process.cwd(), "src/app/(admin)/senders/invite-form.tsx"), "utf8");
    expect(form).toContain('name="actionType"');
    expect(form).toContain('name="senderLabel"');
    expect(form).toContain('name="senderId"');
    expect(actions).toContain("parseSenderInviteInput(formData)");
  });

  it("keeps connected sender revocation separate", () => {
    expect(page).toContain('sender.status === "CONNECTED"');
    expect(page).toContain("revokeSenderAction");
    expect(page).toContain("deleteExpiredPendingSenderAction");
  });

  it("protects deletion with admin authorization and the database RPC", () => {
    const deletion = actions.slice(actions.indexOf("export async function deleteExpiredPendingSenderAction"));
    expect(deletion).toContain("await requireAdmin()");
    expect(deletion).toContain('supabase.rpc("delete_expired_pending_sender"');
  });
});
