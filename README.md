# Rip City Outreach

Production-minded Phase 1–3 foundation for private Google Sheet recipient imports. Stack: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/RLS, Google Sheets API, and Vitest.

Implemented scope:

- admin email/password authentication with server-side route protection
- explicit admin-only RLS and database schema/indexes
- private server-side Google Sheets service-account access
- Sheet URL or Spreadsheet ID parsing and worksheet selection
- required-column validation, normalization, preview, duplicate removal, and atomic campaign import
- safe local seed data using only `example.com`

Not implemented: sender invitations, Gmail OAuth, Gmail drafts/sending, templates UI, email generation, queue workers, or suppression UI. Those begin in Phase 4 and later.

## Run locally

1. Install Node.js 22+ and dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add Supabase plus Google service-account values.
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

`EMAIL_MODE` defaults to `preview`. Phases 1–3 contain no Gmail API calls regardless of that value.
