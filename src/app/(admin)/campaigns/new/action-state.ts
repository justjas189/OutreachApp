import type { ImportedRecipient } from "@/lib/google-sheets/schema";

export type ImportSource = {
  campaignName: string;
  city: string;
  sheetInput: string;
  worksheetName: string;
  spreadsheetId: string;
  resolvedWorksheetName: string;
};

export type PreviewState = {
  error: string | null;
  details: string[];
  source: ImportSource | null;
  preview: {
    recipients: ImportedRecipient[];
    recipientCount: number;
    sourceRowCount: number;
    duplicateCount: number;
    availableWorksheets: string[];
    pageSize: number;
  } | null;
};

export type CommitState = {
  error: string | null;
};

export const initialPreviewState: PreviewState = {
  error: null,
  details: [],
  source: null,
  preview: null,
};

export const initialCommitState: CommitState = {
  error: null,
};