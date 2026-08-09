# Google Sheets and Gmail OAuth setup — Phases 3–6

Google Sheets uses a dedicated service account. Gmail sender accounts use separate per-user OAuth authorization. Sender accounts must never receive Google Sheet, dashboard, campaign, recipient, template, database, or source-code access.

## 1. Create the Google Cloud resources

1. Create or select a Google Cloud project for Rip City Outreach.
2. Open **APIs & Services → Library** and enable **Google Sheets API** and **Gmail API**.
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

## 5. Configure OAuth consent

1. Open **Google Auth Platform** and configure branding, audience, and contact information.
2. For development, keep the app in testing and add every Gmail sender as a test user.
3. Add only these scopes:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.compose`
4. Do not add Drive, Sheets, Contacts, Gmail inbox-reading, `gmail.modify`, or `mail.google.com` scopes.

`gmail.compose` is the narrowest single Gmail scope supporting both future draft creation and sending. Google currently classifies it as a restricted scope. Public production use may require OAuth verification and, when restricted-scope data is stored or transmitted, a security assessment. Complete Google's current requirements before moving beyond controlled test users.

## 6. Create OAuth Web Client

1. Open **Google Auth Platform → Clients**.
2. Create an **OAuth client ID** with application type **Web application**.
3. Add exact authorized redirect URIs:
   - Local: `http://localhost:3000/api/google/oauth/callback`
   - Production: `https://YOUR_DOMAIN/api/google/oauth/callback`
4. Store client ID and client secret in `.env.local` locally and encrypted deployment environment variables in production.
5. Never place either value in browser code or commit them.

```dotenv
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_WEB_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
APP_URL=http://localhost:3000
```

Production `GOOGLE_OAUTH_REDIRECT_URI` and `APP_URL` must use the deployed HTTPS origin.

## 7. Configure token encryption

Generate a unique 32-byte key once:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store output as server-only `TOKEN_ENCRYPTION_KEY`. Never rotate it without first planning how existing encrypted refresh tokens will be re-encrypted; deleting it makes stored sender credentials unusable.

## 8. Connect Gmail senders

1. Sign in to admin dashboard and open **Senders**.
2. Create one invitation per sender and copy raw link immediately. App stores only token hash.
3. Give each sender only their own link.
4. Sender selects **Connect Gmail**, completes Google consent, and sees generic success page.
5. Confirm dashboard shows sender as `CONNECTED`.

Flow uses expiring one-time invitation tokens, hashed OAuth state, an HttpOnly SameSite cookie, PKCE, verified Google ID token, and AES-256-GCM encrypted refresh-token storage. Access and refresh tokens are never returned to browser or logged. Phases 4–6 do not create Gmail drafts and do not send email.
