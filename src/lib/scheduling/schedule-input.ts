import { z } from "zod";

import { isSelectableTimeZone, localDateTimeToUtc } from "@/lib/scheduling/timezone";

export const scheduleInputSchema = z.discriminatedUnion("scheduleMode", [
  z.object({
    scheduleMode: z.literal("now"),
    campaignId: z.uuid(),
    timezone: z.string().trim().refine(isSelectableTimeZone),
    localDateTime: z.string().optional(),
  }),
  z.object({
    scheduleMode: z.literal("later"),
    campaignId: z.uuid(),
    timezone: z.string().trim().refine(isSelectableTimeZone),
    localDateTime: z.string().min(1),
  }),
]);

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export function resolveScheduleDate(input: ScheduleInput, now = new Date()): Date {
  const scheduledAt = input.scheduleMode === "now"
    ? now
    : localDateTimeToUtc(input.localDateTime, input.timezone);

  if (input.scheduleMode === "later" && scheduledAt.getTime() <= now.getTime()) {
    throw new Error("Scheduled time must be in the future.");
  }
  return scheduledAt;
}
