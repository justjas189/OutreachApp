import { z } from "zod";

const readinessSchema = z.object({
  ready: z.boolean(),
  blockingReasons: z.array(z.string()),
  recipientCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  generatedCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
  connectedSenderCount: z.number().int().nonnegative(),
  scheduledAt: z.string().nullable(),
  scheduleTimezone: z.string().nullable(),
});

export type CampaignReadiness = z.infer<typeof readinessSchema>;

export const unavailableCampaignReadiness: CampaignReadiness = {
  ready: false,
  blockingReasons: ["Campaign readiness could not be verified"],
  recipientCount: 0,
  eligibleCount: 0,
  generatedCount: 0,
  approvedCount: 0,
  suppressedCount: 0,
  connectedSenderCount: 0,
  scheduledAt: null,
  scheduleTimezone: null,
};

export function parseCampaignReadiness(value: unknown): CampaignReadiness {
  const parsed = readinessSchema.safeParse(value);
  return parsed.success ? parsed.data : unavailableCampaignReadiness;
}

export function readinessAction(reason: string): { href: string; label: string } | null {
  if (reason.includes("sender")) return { href: "/senders", label: "Manage senders" };
  if (reason.includes("template")) return { href: "/templates", label: "Manage templates" };
  if (reason.includes("approval") || reason.includes("generated")) return { href: "emails", label: "Review emails" };
  return null;
}
