import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runtimeMode = vi.hoisted(() => vi.fn(async (): Promise<"preview" | "draft" | "live"> => "preview"));
const runtimeBatchSize = vi.hoisted(() => vi.fn(async () => 5));
vi.mock("@/lib/settings/delivery-mode", () => ({ getRuntimeDeliveryMode: runtimeMode }));
vi.mock("@/lib/settings/batch-size", () => ({ getRuntimeEmailBatchSize: runtimeBatchSize }));

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
  beforeEach(() => {
    runtimeMode.mockReset();
    runtimeMode.mockResolvedValue("preview");
    runtimeBatchSize.mockReset();
    runtimeBatchSize.mockResolvedValue(5);
  });

  it("reads authoritative runtime mode when no test override is supplied", async () => {
    const { repository, gmail } = dependencies("draft");
    await processEmailQueue({ repository, gmail });
    expect(runtimeMode).toHaveBeenCalledOnce();
    expect(runtimeBatchSize).toHaveBeenCalledOnce();
    expect(repository.enqueue).not.toHaveBeenCalled();
    expect(gmail.createDraft).not.toHaveBeenCalled();
    expect(gmail.sendMessage).not.toHaveBeenCalled();
  });

  it("uses authoritative runtime batch size for the existing per-sender queue claim", async () => {
    runtimeMode.mockResolvedValue("draft");
    runtimeBatchSize.mockResolvedValue(7);
    const { repository, gmail } = dependencies("draft");
    const result = await processEmailQueue({ repository, gmail, allowlist: new Set(["safe@example.com"]) });
    expect(repository.claim).toHaveBeenCalledWith("draft", 7, expect.any(String));
    expect(result.batchSize).toBe(7);
  });

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

  it("allowlist mode fails closed when no addresses are configured", async () => {
    const { repository, gmail } = dependencies("live");
    await processEmailQueue({ mode: "live", repository, gmail, recipientGuardMode: "allowlist", allowlist: null });
    expect(gmail.sendMessage).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({
      code: "recipient_not_allowlisted",
      transient: false,
    }));
  });

  it("production mode does not require recipient allowlisting", async () => {
    const { repository, gmail } = dependencies("live");
    await processEmailQueue({ mode: "live", repository, gmail, recipientGuardMode: "production", allowlist: new Set() });
    expect(gmail.sendMessage).toHaveBeenCalledOnce();
    expect(repository.succeed).toHaveBeenCalledOnce();
  });

  it.each([
    "suppressed recipient",
    "unapproved recipient or draft",
    "ineligible sender",
    "future schedule",
    "paused campaign",
    "archived campaign",
    "deleted campaign",
  ])("production mode still blocks final database rejection: %s", async () => {
    const { repository, gmail } = dependencies("live");
    repository.prepare = vi.fn(async () => null);
    const result = await processEmailQueue({ mode: "live", repository, gmail, recipientGuardMode: "production" });
    expect(result.skipped).toBe(1);
    expect(gmail.sendMessage).not.toHaveBeenCalled();
  });

  it("production mode preserves duplicate-send prevention when atomic claim returns no work", async () => {
    const { repository, gmail } = dependencies("live");
    repository.claim = vi.fn(async () => []);
    const result = await processEmailQueue({ mode: "live", repository, gmail, recipientGuardMode: "production" });
    expect(result.claimed).toBe(0);
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(gmail.sendMessage).not.toHaveBeenCalled();
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
