# AtlasReach

AtlasReach is a production-minded outreach campaign management platform built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/RLS, Google Sheets API, Gmail API/Google OAuth, and Vitest.

Implemented through Phases 1–10:

- admin email/password authentication with server-side route protection and admin-only RLS
- private, server-only Google Sheets service-account import with schema validation, normalized preview, duplicate removal, and atomic campaign creation
- expiring one-time sender invitations, hashed invite/OAuth state, PKCE, minimum `gmail.compose` access, and AES-256-GCM refresh-token encryption
- connected-sender-only balanced assignment, editable Business Type templates, and deterministic stored email previews
- `GENERATED → APPROVED → QUEUED → SENT/FAILED` workflow with editing and approval
- preview/draft/live enforcement, optional recipient allowlist, per-sender batch limits, transient retries, safe logs, and suppression checks
- database-backed scheduling and queue processing with UTC instants, IANA timezone context, atomic `SKIP LOCKED` claims, unique enqueue keys, and protected cron access
- manual STOP / UNSUBSCRIBED / INVALID / MANUAL BLOCK suppression
- complete campaign management: metadata edits, pre-send reassignment, schedule edit/cancel, pause/resume, active/history views, safe permanent deletion, and read-only archive preservation
- database and application tests using only fake `example.com` data; automated tests never call real Google APIs

Not implemented by design: Gmail inbox reading, automatic STOP detection, AI personalization, tracking, scraping, or provider-limit bypassing.

## Campaign lifecycle

The database—not the browser—decides the destructive action inside one locked transaction:

- Never sent and no send/history records: permanently deletes the campaign and cascade-owned recipients, previews, assignments, schedules, and unsent queue records.
- Any sent email, send/history record, or active queue claim: archives instead. It clears scheduling, cancels unclaimed queue work, preserves delivery history, and permanently excludes the campaign from new queue eligibility.

Archived campaigns are hidden from the default `/campaigns` view, remain available under **Archived / History**, and are read-only through normal admin workflows.

## Run locally

1. Install Node.js 22+ and dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`. Keep `EMAIL_MODE=preview`.
3. Configure and migrate Supabase using [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
4. Configure private Sheets and sender OAuth using [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).
5. Start the app:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000` and sign in as an admin.

## Verification

With local Supabase running:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:db
npm run build
```

`EMAIL_MODE` is fail-safe: missing or invalid values resolve to `preview`. It is now the deployment ceiling/fallback; authenticated admins choose the runtime mode from the dashboard, but cannot exceed that ceiling. Database lookup errors fail closed to preview. Preview mode never enqueues or calls Gmail. The protected queue endpoint is `/api/cron/process-email-queue`; `vercel.json` invokes it every five minutes in production.

`EMAIL_BATCH_SIZE` remains the safe environment fallback and defaults to `5` when missing or invalid. Authenticated admins can select the active runtime value from `1` through `50` without restarting the app. Existing queue semantics are unchanged: the value limits claims **per connected sender per worker execution**, so total claimed work can be the value multiplied by the number of eligible connected senders. Provider limits, atomic claims, suppression, allowlist, retry, schedule, lifecycle, and duplicate-send checks still apply.

Dashboard Quick Run lists only campaigns that pass the shared database readiness check: active lifecycle, recipients, connected sender credentials, matching templates, generated/approved previews, suppression handling, and no queue history. Quick Run shows the active per-sender batch size and calls the same scheduling and queue RPCs as the campaign page.

For first deployment and safe preview → draft → live rollout, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security reporting and credential-response guidance are in [SECURITY.md](SECURITY.md).
