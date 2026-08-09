# Google Sheets setup — Phase 3

Phase 3 uses a dedicated Google Cloud service account with the read-only Sheets scope. Gmail API, Gmail OAuth, OAuth consent, and sender authorization belong to Phase 4 and are intentionally not configured here.

## 1. Create the Google Cloud resources

1. Create or select a Google Cloud project for Rip City Outreach.
2. Open **APIs & Services → Library** and enable **Google Sheets API**.
3. Open **IAM & Admin → Service Accounts** and create a dedicated service account such as `rip-city-sheets-reader`.
4. Do not enable domain-wide delegation. The service account does not need broad project IAM roles to read a Sheet shared directly with it.
5. Create a JSON key only because Vercel cannot attach a Google workload identity directly. Download it once and store it in a password manager or secret manager. Never commit the JSON file.

## 2. Share only the private Sheet

1. Open the private Google Sheet.
2. Share it with the service account's `client_email` as **Viewer**.
3. Do not share it publicly or enable “anyone with the link.”
4. Do not share it with any Gmail sender account. Sender employees never need Sheet, dashboard, recipient, database, or source-code access.

Required worksheet columns are:

```text
NAME
EMAIL
LINK
Business Type
```

Header comparison ignores casing and repeated whitespace. Recipient values are trimmed, internal whitespace is collapsed, emails are lowercased, empty rows are ignored, and duplicate emails are skipped within the campaign preview. The database repeats duplicate protection with a unique constraint.

## 3. Configure server-only environment variables

Copy values from the service-account JSON into `.env.local`:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=sheets-reader@YOUR_PROJECT.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="YOUR_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_WITH_LITERAL_\\n_NEWLINES"
```

Keep literal `\n` sequences when storing the key on one line; the server converts them to newlines. These names must never use the `NEXT_PUBLIC_` prefix.

Restart `npm run dev` after changing environment variables.

## 4. Verify access

1. Sign into the app as an admin.
2. Open **Import recipients**.
3. Enter either the full Google Sheet URL or its Spreadsheet ID.
4. Enter a worksheet name, or leave it blank to use the first worksheet.
5. Select **Preview recipients**. Nothing is saved yet.
6. Review normalized rows and any duplicate count.
7. Select **Commit campaign**. The server re-reads the Sheet before making one atomic database commit.

If preview fails, confirm the Sheets API is enabled, the Sheet is shared with the exact service-account email, and the private key retains its header/footer and newline escapes.
