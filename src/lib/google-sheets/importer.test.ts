import { describe, expect, it, vi } from "vitest";

import { loadSheetPreview, type SheetsReader } from "./importer";

describe("loadSheetPreview", () => {
  it("uses a mocked server-side Sheets reader and previews the selected worksheet", async () => {
    const reader: SheetsReader = {
      getWorksheetNames: vi.fn().mockResolvedValue(["Archive", "Recipients"]),
      getWorksheetValues: vi.fn().mockResolvedValue([
        ["NAME", "EMAIL", "LINK", "Business Type"],
        ["Petal & Pine", "PETAL@example.com", "https://example.com/petal", "Florists"],
      ]),
    };

    const preview = await loadSheetPreview(reader, "spreadsheet-id", "Recipients");

    expect(reader.getWorksheetValues).toHaveBeenCalledWith("spreadsheet-id", "Recipients");
    expect(preview.recipients[0].email).toBe("petal@example.com");
    expect(preview.availableWorksheets).toEqual(["Archive", "Recipients"]);
  });

  it("rejects an unknown worksheet without reading values", async () => {
    const reader: SheetsReader = {
      getWorksheetNames: vi.fn().mockResolvedValue(["Recipients"]),
      getWorksheetValues: vi.fn(),
    };

    await expect(loadSheetPreview(reader, "spreadsheet-id", "Missing")).rejects.toThrow(
      "Worksheet was not found.",
    );
    expect(reader.getWorksheetValues).not.toHaveBeenCalled();
  });
});
