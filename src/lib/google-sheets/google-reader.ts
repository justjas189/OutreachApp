import "server-only";

import { google } from "googleapis";

import { getGoogleServiceAccountConfig } from "@/lib/env";

import type { SheetsReader } from "./importer";

const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function escapeWorksheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

export function createGoogleSheetsReader(): SheetsReader {
  const credentials = getGoogleServiceAccountConfig();
  const auth = new google.auth.JWT({
    email: credentials.email,
    key: credentials.privateKey,
    scopes: [SHEETS_READONLY_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });

  return {
    async getWorksheetNames(spreadsheetId) {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      });

      return (response.data.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((title): title is string => Boolean(title));
    },

    async getWorksheetValues(spreadsheetId, worksheetName) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: escapeWorksheetName(worksheetName),
        majorDimension: "ROWS",
        valueRenderOption: "FORMATTED_VALUE",
      });

      return (response.data.values ?? []) as unknown[][];
    },
  };
}
