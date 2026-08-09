import {
  type ParsedRecipients,
  parseSheetRows,
  SheetValidationError,
} from "./schema";

export type SheetsReader = {
  getWorksheetNames(spreadsheetId: string): Promise<string[]>;
  getWorksheetValues(spreadsheetId: string, worksheetName: string): Promise<unknown[][]>;
};

export type SheetPreview = ParsedRecipients & {
  spreadsheetId: string;
  worksheetName: string;
  availableWorksheets: string[];
};

export async function loadSheetPreview(
  reader: SheetsReader,
  spreadsheetId: string,
  requestedWorksheet?: string,
): Promise<SheetPreview> {
  const availableWorksheets = await reader.getWorksheetNames(spreadsheetId);

  if (availableWorksheets.length === 0) {
    throw new SheetValidationError("Spreadsheet has no worksheets.");
  }

  const worksheetName = requestedWorksheet?.trim() || availableWorksheets[0];
  if (!availableWorksheets.includes(worksheetName)) {
    throw new SheetValidationError("Worksheet was not found.", availableWorksheets);
  }

  const values = await reader.getWorksheetValues(spreadsheetId, worksheetName);
  return {
    spreadsheetId,
    worksheetName,
    availableWorksheets,
    ...parseSheetRows(values),
  };
}
