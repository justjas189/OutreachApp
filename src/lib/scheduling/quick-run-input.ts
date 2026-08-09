import { z } from "zod";

import { isSelectableTimeZone, localDateTimeToUtc } from "@/lib/scheduling/timezone";

const campaignIdSchema = z.uuid();

export type QuickRunInput =
  | { campaignId: string; executionType: "now" }
  | { campaignId: string; executionType: "schedule"; localDateTime: string; timezone: string };

export type QuickRunInputErrorCode =
  | "campaign-missing"
  | "campaign-invalid"
  | "execution-type-invalid"
  | "datetime-required"
  | "timezone-missing"
  | "timezone-invalid"
  | "scheduled-time-invalid"
  | "scheduled-time-past";

export class QuickRunInputError extends Error {
  constructor(public readonly code: QuickRunInputErrorCode, message: string) {
    super(message);
    this.name = "QuickRunInputError";
  }
}

export function parseQuickRunFormData(formData: FormData): QuickRunInput {
  const campaignIdValue = formData.get("campaignId");
  if (typeof campaignIdValue !== "string" || campaignIdValue.trim() === "") {
    throw new QuickRunInputError("campaign-missing", "Campaign selection was not submitted.");
  }
  const campaignId = campaignIdSchema.safeParse(campaignIdValue.trim());
  if (!campaignId.success) {
    throw new QuickRunInputError("campaign-invalid", "Campaign selection is invalid.");
  }

  const executionType = formData.get("executionType");
  if (executionType === "now") return { campaignId: campaignId.data, executionType };
  if (executionType !== "schedule") {
    throw new QuickRunInputError("execution-type-invalid", "Execution type is invalid.");
  }

  const localDateTimeValue = formData.get("localDateTime");
  if (typeof localDateTimeValue !== "string" || localDateTimeValue.trim() === "") {
    throw new QuickRunInputError("datetime-required", "Scheduled date and time are required.");
  }
  const timezoneValue = formData.get("timezone");
  if (typeof timezoneValue !== "string" || timezoneValue.trim() === "") {
    throw new QuickRunInputError("timezone-missing", "Timezone was not submitted.");
  }
  const timezone = timezoneValue.trim();
  if (!isSelectableTimeZone(timezone)) {
    throw new QuickRunInputError("timezone-invalid", `${timezone} is not a valid IANA timezone.`);
  }

  return {
    campaignId: campaignId.data,
    executionType,
    localDateTime: localDateTimeValue.trim(),
    timezone,
  };
}

export function resolveQuickRunSchedule(input: QuickRunInput, now = new Date()) {
  if (input.executionType === "now") {
    return { scheduledAt: now, scheduleTimezone: "UTC" };
  }

  let scheduledAt: Date;
  try {
    scheduledAt = localDateTimeToUtc(input.localDateTime, input.timezone);
  } catch {
    throw new QuickRunInputError(
      "scheduled-time-invalid",
      "Scheduled date and time is invalid, nonexistent, or ambiguous in that timezone.",
    );
  }
  if (scheduledAt.getTime() <= now.getTime()) {
    throw new QuickRunInputError("scheduled-time-past", "Scheduled time must be in the future.");
  }
  return { scheduledAt, scheduleTimezone: input.timezone };
}
