export function distributeEvenly<TRecipient, TSender>(
  recipients: readonly TRecipient[],
  senders: readonly TSender[],
): Array<{ recipient: TRecipient; sender: TSender }> {
  if (senders.length === 0) {
    throw new Error("At least one connected sender is required.");
  }

  return recipients.map((recipient, index) => ({
    recipient,
    sender: senders[index % senders.length],
  }));
}
