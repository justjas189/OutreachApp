# Deployment — Vercel + Supabase

Deploy only after local lint, type checks, Vitest, pgTAP, and production build pass. Production must begin in `EMAIL_MODE=preview`; never make live the default. `EMAIL_MODE` is the deployment ceiling/fallback. Dashboard runtime mode cannot exceed it, and database-setting lookup failures fail closed to preview.

## 1. Prerequisites

- Node.js 22 or newer
- a production Supabase project
- a Google Cloud project configured by [GOOGLE_SETUP.md](GOOGLE_SETUP.md)
- a Vercel account and project
- Vercel CLI (recommended):

  ```bash
  npm i -g vercel
  vercel login
  vercel link
  ```

Vercel CLI enables `vercel env pull`, preview deployments, protected requests, and deployment logs. Official references: [CLI deployment](https://vercel.com/docs/projects/deploy-from-cli), [environment variables](https://vercel.com/docs/environment-variables), and [cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## 2. Prepare production Supabase

1. Create/link the production project as described in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
2. Review the migration plan before applying it:

   ```bash
   npm exec supabase -- link --project-ref YOUR_PROJECT_REF
   npm exec supabase -- db push --dry-run
   npm exec supabase -- db push
   npm exec supabase -- migration list
   ```

3. Create the first admin and refresh that admin's session after setting `raw_app_meta_data.role = admin`.
4. Do not apply `supabase/seed.sql` to production.
5. Run Supabase security/performance advisors after migrations and resolve newly introduced findings before live sending.

## 3. Configure Vercel environment variables

Add every variable from `.env.example` in **Project Settings → Environment Variables**. Use distinct values for Development, Preview, and Production where appropriate. Secrets must remain server-only and must never use `NEXT_PUBLIC_`.

Required production values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY

GOOGLE_CLIENT_ID=YOUR_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_OAUTH_WEB_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_PRODUCTION_DOMAIN/api/google/oauth/callback

GOOGLE_SERVICE_ACCOUNT_EMAIL=sheets-reader@YOUR_PROJECT.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="YOUR_PRIVATE_KEY_WITH_LITERAL_\n_NEWLINES"

TOKEN_ENCRYPTION_KEY=YOUR_UNIQUE_BASE64URL_32_BYTE_KEY

EMAIL_MODE=preview
EMAIL_BATCH_SIZE=5
TEST_RECIPIENT_ALLOWLIST=you@example.com
CRON_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS

APP_URL=https://YOUR_PRODUCTION_DOMAIN
```

Important:

- `APP_URL` and `GOOGLE_OAUTH_REDIRECT_URI` must use the same intended HTTPS origin.
- Add the exact callback URI to the Google OAuth web client. Google does not accept an arbitrary preview-domain wildcard; add an exact stable preview callback only if sender OAuth must be tested there.
- Environment changes apply only to new deployments, so redeploy after changing a value.
- Keep the token-encryption key stable. Changing it without re-encrypting existing refresh tokens disconnects stored sender credentials.
- Use a separate Supabase project and separate encryption/cron secrets for non-production when possible.

With Vercel CLI installed, review names without printing values and pull only into ignored local files:

```bash
vercel env ls
vercel env pull .env.local
```

Never commit the pulled file.

## 4. Cron and queue worker

`vercel.json` calls `/api/cron/process-email-queue` every five minutes. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when the project has a `CRON_SECRET` environment variable. The route rejects missing/invalid credentials and returns generic errors without OAuth data.

The worker is server-driven; no browser timer is involved. Each run:

1. Does nothing in preview mode.
2. Activates only due, non-archived campaigns.
3. Enqueues approved emails idempotently using unique `email_draft_id` rows.
4. Claims small per-sender batches with database row locks and claim tokens.
5. Rechecks campaign state, sender connection, recipient state, schedule, and suppression immediately before Gmail.
6. Retries transient errors with capped exponential backoff; permanent errors fail once.

Paused, future, cancelled-schedule, completed, deleted, and archived campaigns are ineligible. An already-started provider request cannot be revoked mid-request; its final result is still stored for audit, while archive blocks every new claim/preparation.

After deployment, check **Project Settings → Cron Jobs** and function logs. Do not log or paste authorization headers, OAuth tokens, service-role keys, or encrypted credentials.

## 5. Verify and deploy

```bash
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run build
vercel deploy
```

Verify the preview deployment without using real businesses. Then deploy production:

```bash
vercel deploy --prod
```

The local pgTAP suite needs the local Supabase stack:

```bash
npm exec supabase -- start
npm run test:db
```

## 6. Safe first rollout

1. **Preview:** Keep `EMAIL_MODE=preview`. Runtime setting starts in Preview. Use fake `example.com` Sheet rows, import, assign senders, generate/edit/approve, test schedule edit/cancel/pause/resume, and confirm the worker reports zero queue/Gmail work.
2. **Archive/delete:** Delete a never-sent fake campaign; archive a campaign containing a safe fake history record. Confirm active/history filters and cancelled queue state.
3. **OAuth:** Keep Google OAuth in testing and authorize only designated test Gmail accounts. Sender accounts receive only their one-time connection URLs and never Sheet/dashboard access.
4. **Draft:** Set `TEST_RECIPIENT_ALLOWLIST` to addresses you control, change the deployment ceiling to `EMAIL_MODE=draft`, redeploy, then select Draft in the authenticated dashboard. Schedule one approved email and confirm Gmail creates a draft but sends nothing.
5. **Live ceiling:** Keep runtime mode in Draft, keep the allowlist, set `EMAIL_BATCH_SIZE=1`, change the deployment ceiling to `EMAIL_MODE=live`, and redeploy. This ceiling change alone does not change the database runtime mode.
6. **Live canary:** In the dashboard, select Live and accept the explicit real-email confirmation. Quick Run one approved message to an address you control. Confirm exactly one send log and no duplicate queue/send.
7. **Observe:** Check campaign audit history, Gmail result, suppression behavior, cron logs, and Supabase logs/advisors. Return to preview immediately if anything is unexpected.
8. **Expand slowly:** Increase the batch size only within provider limits. Remove or expand the allowlist only after legal/compliance review and a successful controlled canary. The app does not bypass Gmail limits.

## 7. Rollback and incident response

- Fast application control: switch runtime mode to Preview in the authenticated dashboard.
- Deployment kill switch: set `EMAIL_MODE=preview` and redeploy. This ceiling overrides any stored Draft/Live selection.
- Pause active campaigns in the admin UI. Cancel future schedules where appropriate.
- Disable the Vercel cron job if worker execution itself must stop.
- Revoke compromised Google OAuth/client/service-account credentials and Supabase keys; rotate `CRON_SECRET`.
- Do not rotate `TOKEN_ENCRYPTION_KEY` casually. Revoke sender connections if encrypted refresh-token integrity is uncertain.
- Follow [SECURITY.md](../SECURITY.md) for accidental credential exposure.
