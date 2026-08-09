import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GmailGateway } from "./gmail";
import type { QueueRepository } from "./repository";
import { processEmailQueue } from "./worker";

function dependencies(mode: "draft" | "live") {
  const repository: QueueRepository = {
    enqueue: vi.fn(async () => 1),
    claim: vi.fn(async () => [{ queue_id: "019fe2aa-b0aa-78a0-a05b-f946aea5fd58", delivery_mode: mode }]),
    prepare: vi.fn(async () => ({
      queue_id: "019fe2aa-b0aa-78a0-a05b-f946aea5fd58",
      delivery_mode: mode,
      recipient_email: "safe@example.com",
      sender_email: "sender@example.com",
      subject: "Approved subject",
      body: "Approved body",
      encrypted_refresh_token: "encrypted-not-a-real-token",
    })),
    succeed: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    completeCampaigns: vi.fn(async () => 0),
  };
  const gmail: GmailGateway = {
    createDraft: vi.fn(async () => ({ providerMessageId: "message-id", gmailDraftId: "draft-id" })),
    sendMessage: vi.fn(async () => ({ providerMessageId: "message-id" })),
  };
  return { repository, gmail };
}

describe("email queue modes", () => {
  it("preview never touches the queue or Gmail", async () => {
    const { repository, gmail } = dependencies("draft");
    const result = await processEmailQueue({ mode: "preview", repository, gmail });
    expect(result.claimed).toBe(0);
    expect(repository.enqueue).not.toHaveBeenCalled();
    expect(gmail.createDraft).not.toHaveBeenCalled();
    expect(gmail.sendMessage).not.toHaveBeenCalled();
  });

  it("draft creates a Gmail draft and never sends", async () => {
    const { repository, gmail } = dependencies("draft");
    await processEmailQueue({ mode: "draft", repository, gmail, allowlist: new Set(["safe@example.com"]) });
    expect(gmail.createDraft).toHaveBeenCalledOnce();
    expect(gmail.sendMessage).not.toHaveBeenCalled();
    expect(repository.succeed).toHaveBeenCalledOnce();
  });

  it("live sends claimed queue work and never creates a draft", async () => {
    const { repository, gmail } = dependencies("live");
    await processEmailQueue({ mode: "live", repository, gmail, allowlist: new Set(["safe@example.com"]) });
    expect(gmail.sendMessage).toHaveBeenCalledOnce();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });

  it("blocks Gmail when the recipient is outside the allowlist", async () => {
    const { repository, gmail } = dependencies("live");
    await processEmailQueue({ mode: "live", repository, gmail, allowlist: new Set(["owner@example.com"]) });
    expect(gmail.sendMessage).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ code: "recipient_not_allowlisted", transient: false }));
  });

  it("never calls Gmail when final database eligibility rejects a deleted or archived campaign", async () => {
    const { repository, gmail } = dependencies("live");
    repository.prepare = vi.fn(async () => null);
    const result = await processEmailQueue({ mode: "live", repository, gmail, allowlist: null });
    expect(result.skipped).toBe(1);
    expect(gmail.sendMessage).not.toHaveBeenCalled();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });
});
