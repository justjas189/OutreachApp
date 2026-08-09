# Rip City Outreach

Production-minded Phase 1–6 outreach dashboard. Stack: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/RLS, Google Sheets API, Google OAuth, and Vitest.

Implemented scope:

- admin email/password authentication with server-side route protection
- explicit admin-only RLS and database schema/indexes
- private server-side Google Sheets service-account access
- Sheet URL or Spreadsheet ID parsing and worksheet selection
- required-column validation, normalization, preview, duplicate removal, and atomic campaign import
- safe local seed data using only `example.com`
- expiring one-time sender invitations with hashed tokens
- Google OAuth state + PKCE validation and encrypted refresh-token storage
- connected-sender-only balanced campaign assignment
- editable Business Type templates with validated variables
- stored email preview generation, editing, regeneration, and `GENERATED → APPROVED` workflow

Not implemented: Gmail draft creation, Gmail sending, queue workers, or suppression UI. Those belong to later phases. Phases 4–6 never create drafts or send email.

## Run locally

1. Install Node.js 22+ and dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add Supabase, Google service-account, Google OAuth, and token-encryption values.
3. Apply the Supabase migration and create the first admin using [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
4. Share the private Sheet using [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).
5. Start the app:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

`EMAIL_MODE` defaults to `preview`. Phases 4–6 use Gmail authorization/profile verification only; no Gmail draft or send endpoint is implemented.
