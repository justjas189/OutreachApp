import { z } from "zod";

export const REQUIRED_COLUMNS = ["NAME", "EMAIL", "LINK", "Business Type"] as const;

export type ImportedRecipient = {
  name: string;
  email: string;
  link: string;
  business_type: string;
};

export type ParsedRecipients = {
  recipients: ImportedRecipient[];
  sourceRowCount: number;
  duplicateCount: number;
};

export class SheetValidationError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "SheetValidationError";
  }
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export function normalizeWhitespace(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

export function parseSpreadsheetId(input: string): string {
  const value = input.trim();
  let candidate = value;

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new SheetValidationError("Enter a valid Google Sheet URL or Spreadsheet ID.");
    }

    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
      throw new SheetValidationError("Google Sheet URLs must use https://docs.google.com.");
    }

    const match = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    if (!match) {
      throw new SheetValidationError("Google Sheet URL does not contain a Spreadsheet ID.");
    }
    candidate = match[1];
  }

  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(candidate)) {
    throw new SheetValidationError("Spreadsheet ID has an invalid format.");
  }

  return candidate;
}

export function parseSheetRows(values: unknown[][]): ParsedRecipients {
  if (values.length === 0) {
    throw new SheetValidationError("Worksheet is empty.");
  }

  const header = values[0].map(normalizeHeader);
  const requiredIndexes = REQUIRED_COLUMNS.map((column) => ({
    column,
    index: header.indexOf(normalizeHeader(column)),
  }));
  const missing = requiredIndexes.filter(({ index }) => index === -1).map(({ column }) => column);

  if (missing.length > 0) {
    throw new SheetValidationError("Worksheet is missing required columns.", missing);
  }

  const indexFor = (column: (typeof REQUIRED_COLUMNS)[number]) =>
    requiredIndexes.find((entry) => entry.column === column)!.index;
  const uniqueByEmail = new Map<string, ImportedRecipient>();
  const errors: string[] = [];
  let sourceRowCount = 0;
  let duplicateCount = 0;

  values.slice(1).forEach((row, offset) => {
    if (row.every((cell) => normalizeWhitespace(cell) === "")) {
      return;
    }

    sourceRowCount += 1;
    const sheetRow = offset + 2;
    const name = normalizeWhitespace(row[indexFor("NAME")]);
    const rawEmail = normalizeWhitespace(row[indexFor("EMAIL")]);
    const link = normalizeWhitespace(row[indexFor("LINK")]);
    const businessType = normalizeWhitespace(row[indexFor("Business Type")]);
    const emailResult = emailSchema.safeParse(rawEmail);

    const missingValues = [
      !name && "NAME",
      !rawEmail && "EMAIL",
      !link && "LINK",
      !businessType && "Business Type",
    ].filter(Boolean);

    if (missingValues.length > 0) {
      errors.push(`Row ${sheetRow}: missing ${missingValues.join(", ")}.`);
      return;
    }

    if (!emailResult.success) {
      errors.push(`Row ${sheetRow}: EMAIL is invalid.`);
      return;
    }

    if (uniqueByEmail.has(emailResult.data)) {
      duplicateCount += 1;
      return;
    }

    uniqueByEmail.set(emailResult.data, {
      name,
      email: emailResult.data,
      link,
      business_type: businessType,
    });
  });

  if (errors.length > 0) {
    throw new SheetValidationError("Some worksheet rows are invalid.", errors);
  }

  if (uniqueByEmail.size === 0) {
    throw new SheetValidationError("Worksheet has no importable recipient rows.");
  }

  return {
    recipients: [...uniqueByEmail.values()],
    sourceRowCount,
    duplicateCount,
  };
}
