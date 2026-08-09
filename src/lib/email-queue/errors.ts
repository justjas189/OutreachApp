type UnknownApiError = {
  code?: unknown;
  status?: unknown;
  response?: { status?: unknown; data?: { error?: { errors?: Array<{ reason?: unknown }> } } };
};

export type SafeQueueError = { transient: boolean; code: string; message: string };

export function classifyGmailError(error: unknown): SafeQueueError {
  const candidate = (typeof error === "object" && error !== null ? error : {}) as UnknownApiError;
  const status = typeof candidate.response?.status === "number"
    ? candidate.response.status
    : typeof candidate.status === "number" ? candidate.status : undefined;
  const networkCode = typeof candidate.code === "string" ? candidate.code : undefined;
  const reasons = candidate.response?.data?.error?.errors?.map((item) => item.reason).filter((value): value is string => typeof value === "string") ?? [];
  const transientReasons = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);
  const transient = [408, 429, 500, 502, 503, 504].includes(status ?? 0)
    || reasons.some((reason) => transientReasons.has(reason))
    || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(networkCode ?? "");
  if (transient) return { transient: true, code: status ? `gmail_${status}` : "gmail_network", message: "Gmail is temporarily unavailable; retry scheduled." };
  return { transient: false, code: status ? `gmail_${status}` : "gmail_rejected", message: "Gmail rejected the operation; review sender authorization and configuration." };
}
