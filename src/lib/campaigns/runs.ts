import { z } from "zod";

const runReadinessSchema = z.object({
  campaignStatus: z.string(),
  activeRun: z.boolean(),
  allEligibleCount: z.number().int().nonnegative(),
  failedEligibleCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
  blocked: z.array(z.object({ email: z.string(), reason: z.string() })),
  canRunAll: z.boolean(),
  canRetryFailed: z.boolean(),
});

export type CampaignRunReadiness = z.infer<typeof runReadinessSchema>;

export const unavailableRunReadiness: CampaignRunReadiness = {
  campaignStatus: "UNKNOWN",
  activeRun: false,
  allEligibleCount: 0,
  failedEligibleCount: 0,
  suppressedCount: 0,
  blocked: [],
  canRunAll: false,
  canRetryFailed: false,
};

export function parseCampaignRunReadiness(value: unknown): CampaignRunReadiness {
  const parsed = runReadinessSchema.safeParse(value);
  return parsed.success ? parsed.data : unavailableRunReadiness;
}

export const campaignRunFormSchema = z.object({
  campaignId: z.uuid(),
  senderStrategy: z.enum(["single", "balanced"]),
  senderIds: z.array(z.uuid()).min(1),
  runScope: z.enum(["all", "failed"]),
}).superRefine((value, context) => {
  const unique = new Set(value.senderIds);
  if (unique.size !== value.senderIds.length) {
    context.addIssue({ code: "custom", path: ["senderIds"], message: "Sender selection must be unique." });
  }
  if (value.senderStrategy === "single" && value.senderIds.length !== 1) {
    context.addIssue({ code: "custom", path: ["senderIds"], message: "Single strategy requires exactly one sender." });
  }
  if (value.senderStrategy === "balanced" && value.senderIds.length < 2) {
    context.addIssue({ code: "custom", path: ["senderIds"], message: "Balanced strategy requires at least two senders." });
  }
});

