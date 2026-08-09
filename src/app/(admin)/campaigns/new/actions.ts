"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { createGoogleSheetsReader } from "@/lib/google-sheets/google-reader";
import { loadSheetPreview } from "@/lib/google-sheets/importer";
import {
  parseSpreadsheetId,
  SheetValidationError,
} from "@/lib/google-sheets/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import {
  type CommitState,
  initialPreviewState,
  type PreviewState,
} from "./action-state";

const importInputSchema = z.object({
  campaignName: z.string().trim().min(2, "Campaign name is required.").max(120),
  city: z.string().trim().min(2, "City is required.").max(120),
  sheetInput: z.string().trim().min(1, "Google Sheet URL or ID is required."),
  worksheetName: z.string().trim().max(120).optional().default(""),
});


function parseImportInput(formData: FormData) {
  return importInputSchema.safeParse({
    campaignName: formData.get("campaignName"),
    city: formData.get("city"),
    sheetInput: formData.get("sheetInput"),
    worksheetName: formData.get("worksheetName") || "",
  });
}

function inputError(error: z.ZodError): PreviewState {
  return {
    ...initialPreviewState,
    error: "Check the campaign and Sheet details.",
    details: error.issues.map((issue) => issue.message),
  };
}

export async function previewSheetAction(
  _previousState: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  await requireAdmin();
  const parsed = parseImportInput(formData);

  if (!parsed.success) {
    return inputError(parsed.error);
  }

  try {
    const spreadsheetId = parseSpreadsheetId(parsed.data.sheetInput);
    const result = await loadSheetPreview(
      createGoogleSheetsReader(),
      spreadsheetId,
      parsed.data.worksheetName,
    );
    return {
      error: null,
      details: [],
      source: {
        ...parsed.data,
        spreadsheetId,
        resolvedWorksheetName: result.worksheetName,
      },
      preview: {
        recipients: result.recipients,
        recipientCount: result.recipients.length,
        sourceRowCount: result.sourceRowCount,
        duplicateCount: result.duplicateCount,
        availableWorksheets: result.availableWorksheets,
        pageSize: 50,
      },
    };
  } catch (error) {
    if (error instanceof SheetValidationError) {
      return {
        ...initialPreviewState,
        error: error.message,
        details: error.details.slice(0, 50),
      };
    }

    return {
      ...initialPreviewState,
      error: "Google Sheet could not be read. Confirm API access and share the Sheet with the service account.",
    };
  }
}

export async function commitCampaignAction(
  _previousState: CommitState,
  formData: FormData,
): Promise<CommitState> {
  await requireAdmin();
  const parsed = parseImportInput(formData);

  if (!parsed.success) {
    return { error: "Campaign details changed or are invalid. Preview the Sheet again." };
  }

  let campaignId: string | null = null;

  try {
    const spreadsheetId = parseSpreadsheetId(parsed.data.sheetInput);
    const preview = await loadSheetPreview(
      createGoogleSheetsReader(),
      spreadsheetId,
      parsed.data.worksheetName,
    );
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_campaign_with_recipients", {
      p_name: parsed.data.campaignName,
      p_city: parsed.data.city,
      p_google_sheet_id: spreadsheetId,
      p_worksheet_name: preview.worksheetName,
      p_recipients: preview.recipients as Json,
    });

    if (error) {
      return {
        error:
          error.code === "23505"
            ? "Duplicate recipient emails were detected. Preview the Sheet again."
            : "Supabase could not save the campaign. No partial campaign was committed.",
      };
    }

    campaignId = data;
  } catch (error) {
    if (error instanceof SheetValidationError) {
      return { error: `${error.message} Preview the Sheet again before importing.` };
    }
    return { error: "Sheet verification failed. No campaign was committed." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?notice=imported`);
}
