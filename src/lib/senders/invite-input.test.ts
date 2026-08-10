import { describe, expect, it } from "vitest";

import { parseSenderInviteInput } from "./invite-input";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const requestKey = "32000000-0000-4000-8000-000000000001";
const senderId = "32000000-0000-4000-8000-000000000002";

describe("sender invitation input contract", () => {
  it.each(["ACCOUNT_5", "AB", "A".repeat(120)])("accepts create label %s", (senderLabel) => {
    expect(parseSenderInviteInput(form({ actionType: "create", senderLabel, requestKey }))).toEqual({
      success: true,
      data: { actionType: "create", senderLabel, requestKey },
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSenderInviteInput(form({ actionType: "create", senderLabel: "  ACCOUNT_5  ", requestKey }))).toMatchObject({
      success: true,
      data: { senderLabel: "ACCOUNT_5" },
    });
  });

  it.each([
    ["A", "Sender label must contain 2 to 120 characters."],
    ["A".repeat(121), "Sender label must contain 2 to 120 characters."],
    ["", "Sender label is required."],
  ])("rejects invalid create label", (senderLabel, error) => {
    expect(parseSenderInviteInput(form({ actionType: "create", senderLabel, requestKey }))).toEqual({ success: false, error });
  });

  it("re-invite requires only existing sender ID, not a new label", () => {
    expect(parseSenderInviteInput(form({ actionType: "reinvite", senderId, requestKey }))).toEqual({
      success: true,
      data: { actionType: "reinvite", senderId, requestKey },
    });
  });

  it("returns accurate re-invite error", () => {
    expect(parseSenderInviteInput(form({ actionType: "reinvite", senderId: "", requestKey }))).toEqual({
      success: false,
      error: "Select a pending sender to re-invite.",
    });
  });
});
