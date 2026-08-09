import { describe, expect, it } from "vitest";

import {
  parseSheetRows,
  parseSpreadsheetId,
  SheetValidationError,
} from "./schema";

describe("parseSpreadsheetId", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz-1234567890";

  it("accepts a Spreadsheet ID or canonical Google Sheet URL", () => {
    expect(parseSpreadsheetId(id)).toBe(id);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
  });

  it("rejects non-Google URLs and malformed IDs", () => {
    expect(() => parseSpreadsheetId(`https://example.com/${id}`)).toThrow(SheetValidationError);
    expect(() => parseSpreadsheetId("short-id")).toThrow("invalid format");
  });
});

describe("parseSheetRows", () => {
  it("normalizes whitespace/email and removes campaign-local duplicates", () => {
    const result = parseSheetRows([
      [" NAME ", "email", "LINK", " Business   Type "],
      ["  Rose   City Glam ", " HELLO@EXAMPLE.COM ", " https://example.com/rose ", " Makeup Artists "],
      ["Duplicate", "hello@example.com", "https://example.com/duplicate", "Other"],
      ["", "", "", ""],
    ]);

    expect(result).toEqual({
      recipients: [
        {
          name: "Rose City Glam",
          email: "hello@example.com",
          link: "https://example.com/rose",
          business_type: "Makeup Artists",
        },
      ],
      sourceRowCount: 2,
      duplicateCount: 1,
    });
  });

  it("rejects invalid Google Sheet schema", () => {
    expect(() => parseSheetRows([["NAME", "EMAIL", "LINK"]])).toThrowError(
      expect.objectContaining({
        message: "Worksheet is missing required columns.",
        details: ["Business Type"],
      }),
    );
  });

  it("reports invalid recipient rows before import", () => {
    expect(() =>
      parseSheetRows([
        ["NAME", "EMAIL", "LINK", "Business Type"],
        ["Rose City Glam", "not-an-email", "", "Makeup Artists"],
      ]),
    ).toThrow("Some worksheet rows are invalid.");
  });
});
