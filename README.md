# AtlasReach

AtlasReach is a production-minded outreach campaign management platform built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/RLS, Google Sheets API, Gmail API/Google OAuth, and Vitest.

Implemented through Phases 1–10:

- admin email/password authentication with server-side route protection and admin-only RLS
- private, server-only Google Sheets service-account import with schema validation, normalized preview, duplicate removal, and atomic campaign creation
- expiring one-time sender invitations, hashed invite/OAuth state, PKCE, minimum `gmail.compose` access, and AES-256-GCM refresh-token encryption
- connected-sender-only balanced assignment, editable Business Type templates, and deterministic stored email previews
- `GENERATED → APPROVED → QUEUED → SENT/FAILED` workflow with editing and approval
- preview/draft/live enforcement, fail-closed recipient guard, per-sender batch limits, transient retries, safe logs, and suppression checks
- database-backed scheduling and queue processing with UTC instants, IANA timezone context, atomic `SKIP LOCKED` claims, unique enqueue keys, and protected cron access
- manual STOP / UNSUBSCRIBED / INVALID / MANUAL BLOCK suppression
- complete campaign management: metadata edits, pre-send reassignment, schedule edit/cancel, pause/resume, active/history views, safe permanent deletion, and read-only archive preservation
- immutable campaign runs: single or selected-balanced senders, scheduled reruns, failed-only retry, all-recipient rerun warnings, run-scoped queue attempts, and preserved prior SENT/FAILED history
- interactive Delivery Mode cards plus AtlasReach AR favicon and Apple app icon
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

`RECIPIENT_GUARD_MODE` is server-only deployment authority. Missing or invalid values resolve to `allowlist`; in that mode only `TEST_RECIPIENT_ALLOWLIST` addresses reach Gmail, and an empty list permits nobody. Set exactly `production` only after controlled testing. Production recipient mode removes only the test-address restriction; all queue eligibility and safety checks remain enforced.

Dashboard Quick Run lists non-archived campaigns with status, counts, and current run eligibility. Database checks cover lifecycle, approval, suppression, connected sender credentials, schedule, and active-run concurrency. Quick Run shows the active per-sender batch size and calls the same transactional run RPC as the campaign page.

Quick Run now also handles completed and failed campaigns. Each submission creates a new `campaign_runs` record and immutable `campaign_run_recipients` snapshots. Choose one connected sender or balance only selected connected senders. Completed campaigns support deliberate all-eligible reruns; failed campaigns support failed-only retries after current suppression, recipient-guard, approval, sender credential, lifecycle, and concurrency checks pass. Prior run and queue rows never reset.

For first deployment and safe preview → draft → live rollout, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security reporting and credential-response guidance are in [SECURITY.md](SECURITY.md).
