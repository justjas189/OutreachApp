# Implementation Rule

This specification describes the complete target application.

Do NOT assume every requirement should be implemented in a single Codex session.

The project must be implemented incrementally according to the phases defined in this document.

When the user specifies a phase or phase range:
- implement only those phases;
- preserve completed earlier phases;
- do not prematurely implement later phases;
- do not create fake implementations merely to make later features appear complete.

At the end of each phase range, stop and provide a verification report before continuing.

Build a production-minded MVP web application called “AtlasReach”.

The purpose of the application is to let an admin manage outreach campaigns using recipient data from a private Google Sheet while connecting multiple Gmail sender accounts through OAuth.

IMPORTANT ARCHITECTURE REQUIREMENT

The Gmail sender accounts must NEVER need access to:
- the private Google Sheet
- campaign recipient data
- admin dashboard
- email templates
- other sender accounts
- Supabase database
- source code

A sender account should only authorize this application to send email through that Gmail account.

Do not share the Google Sheet with sender accounts.

Do not use a Google Apps Script bound to the Sheet for sending emails.

Use this architecture:

Admin
  ↓
Next.js Web Dashboard
  ↓
Backend / Server API
  ├── Supabase
  ├── Google Sheets API
  └── Gmail API
        ├── Sender Account 1
        ├── Sender Account 2
        ├── Sender Account 3
        └── Sender Account 4


TECH STACK

Use:

- Next.js with App Router
- TypeScript
- Tailwind CSS
- Supabase
  - PostgreSQL
  - Supabase Auth
  - Row Level Security
- Google Sheets API
- Gmail API + Google OAuth 2.0
- Vercel-compatible deployment
- Vitest or another appropriate test framework

Use server-side code for all sensitive Google API operations.

Never expose OAuth refresh tokens, service account credentials, Supabase service-role keys, or encryption secrets to the browser.


==================================================
1. AUTHENTICATION AND ROLES
==================================================

There are two concepts:

ADMIN
- Can access the full dashboard.
- Can manage campaigns.
- Can import Google Sheet data.
- Can manage templates.
- Can connect/invite sender accounts.
- Can review generated emails.
- Can approve emails.
- Can start/stop campaigns.
- Can view sending history.
- Can manage suppression lists.

SENDER
- Does NOT receive dashboard access.
- Does NOT see recipient data.
- Does NOT see campaigns.
- Does NOT see the Google Sheet.
- Only sees a minimal Gmail authorization page.

Use Supabase Auth for admins.

For sender accounts, create a secure one-time invitation/connection URL.

Example:

/connect/[token]

The page should only show something similar to:

--------------------------------
AtlasReach

Connect your Gmail account so it can be used
as an authorized sender for Rip City Review.

[ Connect Gmail ]
--------------------------------

After successful OAuth:

✓ Gmail connected successfully.
You may close this page.

Do not expose campaign information on this page.


==================================================
2. GOOGLE SHEETS INTEGRATION
==================================================

The admin has a private Google Sheet containing:

NAME
EMAIL
LINK
Business Type

Use a Google Cloud Service Account for Sheets API access.

The private Sheet will be shared ONLY with the service account.

The Gmail sender accounts must not have Sheet access.

Allow the admin to enter either:

- Google Sheet URL
or
- Spreadsheet ID

Then import rows from a selected worksheet.

Validate that the required columns exist:

NAME
EMAIL
LINK
Business Type

Show a preview before importing.

Normalize whitespace and email casing.

Prevent duplicate recipients within the same campaign.


==================================================
3. DATABASE DESIGN
==================================================

Create proper Supabase migrations.

Suggested tables:

profiles
- id
- role
- created_at

sender_accounts
- id
- email
- display_name
- status
- encrypted_refresh_token
- google_account_id if available
- connected_at
- revoked_at
- created_at

sender_invites
- id
- token_hash
- expires_at
- used_at
- created_by
- sender_label

campaigns
- id
- name
- city
- status
- google_sheet_id
- worksheet_name
- created_by
- created_at
- started_at
- completed_at

recipients
- id
- campaign_id
- name
- email
- link
- business_type
- assigned_sender_id
- status
- created_at
- sent_at
- last_error

templates
- id
- business_type
- guide_title
- audience
- services_focus
- body_template
- subject_template
- created_at
- updated_at

email_drafts
- id
- campaign_id
- recipient_id
- sender_account_id
- subject
- body
- status
- gmail_draft_id if used
- created_at
- approved_at
- sent_at

suppression_list
- id
- email
- reason
- source
- created_at

send_logs
- id
- campaign_id
- recipient_id
- sender_account_id
- status
- provider_message_id
- error_message
- created_at

Feel free to improve this schema if there is a cleaner relational design.

Create useful indexes and foreign keys.

Use RLS so only authenticated admins can access campaign data.

OAuth secrets must never be accessible through normal Supabase client queries.


==================================================
4. GOOGLE OAUTH / GMAIL
==================================================

Each sender must authorize their own Gmail account.

Use the minimum Gmail OAuth scope necessary.

Because the application should support creating drafts and sending them, prefer the minimal Gmail scope that supports compose/draft/send functionality.

Do NOT request:
- Google Drive access
- Google Sheets access
- Google Contacts access
- Gmail inbox reading

unless required for a feature implemented later.

Do not implement STOP reply scanning in the MVP because that would require inbox-reading permissions.

Use secure OAuth state verification.

OAuth flow:

Sender invite
   ↓
Connect Gmail
   ↓
Google OAuth
   ↓
Callback
   ↓
Validate state
   ↓
Retrieve sender identity
   ↓
Encrypt refresh token server-side
   ↓
Store sender connection
   ↓
Mark invitation used

Encrypt stored refresh tokens.

Use an environment variable such as:

TOKEN_ENCRYPTION_KEY=

Use authenticated encryption such as AES-256-GCM or an equivalent secure server-side mechanism.

Never log OAuth access tokens or refresh tokens.


==================================================
5. CAMPAIGN CREATION
==================================================

Create a campaign wizard.

Step 1:
Campaign details

Example:
Campaign Name:
Best Makeup Artists in Portland

City:
Portland

Step 2:
Select/import Google Sheet.

Step 3:
Preview recipients.

Step 4:
Assign sender accounts.

Support automatic balanced distribution.

Sender assignment also supports a single connected sender or an explicitly selected subset of two or more connected senders. Only senders with usable encrypted credentials may be selected. Historical run assignments are immutable.

Example:

200 recipients
4 connected senders

Account 1 → 50
Account 2 → 50
Account 3 → 50
Account 4 → 50

Distribution should work with different numbers of recipients and sender accounts.

Do NOT attempt to bypass Gmail or Google sending limits.

The application should respect provider quotas and configurable internal campaign limits.


==================================================
6. EMAIL TEMPLATE SYSTEM
==================================================

The application needs reusable templates based on Business Type.

Example template data:

Business Type:
Makeup Artists

Guide Title:
Best Makeup Artists

Audience:
brides, wedding parties, event attendees,
photographers, models, and beauty enthusiasts

Services:
bridal makeup, special event makeup,
editorial makeup, photoshoots, airbrush makeup,
makeup lessons, and professional beauty services


Support template variables such as:

{{NAME}}
{{EMAIL}}
{{LINK}}
{{BUSINESS_TYPE}}
{{CITY}}
{{GUIDE_TITLE}}
{{AUDIENCE}}
{{SERVICES}}


Example subject:

Can {{NAME}} Be Featured in {{CITY}}'s {{GUIDE_TITLE}} Guide?


Example body structure:

Hi {{NAME}} Team,

My name is Justine, Partnerships Manager at Rip City Review...

[personalized content based on Business Type]

As a reference, you can view the structure and quality
of our existing guides here:

{{LINK}}

Here's what this means for {{NAME}}:

Increased Visibility – ...

Enhanced Credibility – ...

More Qualified Enquiries – ...

If you're interested in securing a spot, simply reply
to this email and I'd be happy to send over the details.

P.S. If this opportunity isn't the right fit for your
business, simply reply with "STOP", and I won't contact
you again.

Best regards,

Justine
Partnerships Manager
Rip City Review

www.theripcityreview.com


Templates must be editable from the admin dashboard.

Do not require AI to generate every email.

Use deterministic templates first.

Design the code so AI-generated personalization could be added later as an optional feature.


==================================================
7. EMAIL WORKFLOW
==================================================

Use these recipient/email states:

PENDING
GENERATED
APPROVED
QUEUED
SENT
FAILED
SUPPRESSED


Workflow:

Imported
   ↓
PENDING

Generate email
   ↓
GENERATED

Admin reviews email
   ↓
APPROVED

Campaign starts
   ↓
QUEUED

Send
   ↓
SENT

or

FAILED

Each execution is represented by an immutable campaign run. Completed campaigns may create a new numbered run; failed recipients may create a deliberate failed-only retry run. Run snapshots preserve delivery mode, batch size, schedule/timezone, sender strategy, selected senders, recipient-approved content, queue attempts, and retry relationships. Previously SENT recipients are included in an all-recipient rerun only after explicit warning and confirmation.


Create a campaign preview screen where the admin can inspect:

Recipient
Sender
Subject
Email Body
Business Type

Allow:

Approve
Edit
Reject / regenerate
Approve All


==================================================
8. TEST MODE — VERY IMPORTANT
==================================================

Implement a safe test mode before real sending.

Environment setting:

EMAIL_MODE=preview

Supported modes should be:

preview
draft
live


PREVIEW
- Never call Gmail send.
- Render generated emails in the dashboard only.

DRAFT
- Create Gmail drafts but do not send them.

LIVE
- Send approved queued emails.

The application must clearly display the active mode.

If EMAIL_MODE != live, show a visible badge:

TEST MODE

For additional protection, support:

RECIPIENT_GUARD_MODE=allowlist
TEST_RECIPIENT_ALLOWLIST=

Recipient guard mode defaults/fails closed to `allowlist`. In allowlist mode, Gmail operations must only target addresses in `TEST_RECIPIENT_ALLOWLIST`; an empty list permits nobody. Explicit `production` mode removes only this test-recipient restriction and must not bypass any other sending safety or eligibility check.

This allows testing with my own addresses without accidentally emailing businesses.


==================================================
9. SENDING QUEUE
==================================================

Do not send hundreds of emails inside a single HTTP request.

Create a queue/batch-processing architecture.

For MVP deployment on Vercel, implement a simple database-backed queue that can be processed from a secure server endpoint / cron job.

Process small batches.

Example:

5 emails per sender per queue execution

Make this configurable:

EMAIL_BATCH_SIZE=5

The system must:

- skip suppressed recipients
- skip already-sent recipients
- prevent duplicate sends
- check that the assigned Gmail account is connected
- catch Gmail API errors
- save errors in send_logs
- retry only appropriate transient errors
- never endlessly retry permanent errors

Use database locking or another mechanism to prevent two workers from sending the same queued email.


==================================================
10. SUPPRESSION LIST
==================================================

Create a suppression list.

Before generating/sending an email, check the recipient email against it.

If suppressed:

recipient.status = SUPPRESSED

and never send.

Admin should be able to manually add:

email
reason

Examples:

STOP
UNSUBSCRIBED
INVALID
MANUAL BLOCK

The email currently contains:

Reply "STOP" and I won't contact you again.

For this MVP, STOP responses can be added manually.

Design the architecture so automatic reply detection can be added later without rewriting the campaign system.


==================================================
11. DASHBOARD
==================================================

Create a clean professional admin dashboard.

Do not over-design it.

Pages:

/dashboard

/campaigns

/campaigns/new

/campaigns/[id]

/templates

/senders

/suppression

/settings


Dashboard summary example:

AtlasReach

Campaigns
3

Pending
84

Approved
42

Sent
147

Failed
2


Sender Accounts

Account 1
sender1@gmail.com
Connected
32 / 50

Account 2
sender2@gmail.com
Connected
30 / 50

Account 3
sender3@gmail.com
Connected
27 / 50

Account 4
sender4@gmail.com
Disconnected

Quick Run acts as a compact run control: campaign/open link, current/latest status, counts, single or selected-balanced sender strategy, Run Now/Schedule, delivery mode, batch size, failed-only retry, and confirmed all-recipient rerun.


Campaign page should show:

Campaign status
Recipient count
Generated
Approved
Queued
Sent
Failed
Suppressed

and a recipient table.


==================================================
12. SENDER MANAGEMENT
==================================================

Create /senders.

Admin can:

- Create sender invitation
- Copy connection link
- View Gmail address after connection
- See connected/disconnected status
- Revoke sender connection
- Rename sender label

Example:

ACCOUNT 1
justine@example.com
● Connected

ACCOUNT 2
employee@example.com
● Connected

ACCOUNT 3
Waiting for connection

[Copy Invite Link]


Sender invitation tokens must:

- be cryptographically random
- be stored hashed, not plaintext
- expire
- be one-time-use


==================================================
13. SECURITY
==================================================

Treat security as an important part of the implementation.

Requirements:

- Admin-only routes must be protected server-side.
- Use Supabase RLS.
- Never expose service-role keys to the browser.
- Never expose Google service-account credentials.
- Never expose Gmail refresh tokens.
- Encrypt Gmail refresh tokens.
- Validate all server input.
- Validate Sheet IDs/URLs.
- Sanitize template variables.
- Escape displayed data appropriately.
- Prevent CSRF/state attacks during OAuth.
- Use secure cookies where applicable.
- Never store OAuth tokens in localStorage.
- Never include secrets in Git.
- Provide .env.example only.
- Never put real credentials into example files.


==================================================
14. GOOGLE CLOUD SETUP DOCUMENTATION
==================================================

Create:

docs/GOOGLE_SETUP.md

Explain step-by-step how to:

1. Create/select Google Cloud project.
2. Enable Gmail API.
3. Enable Google Sheets API.
4. Configure OAuth consent screen.
5. Create OAuth Web Client.
6. Configure redirect URLs for localhost.
7. Configure redirect URLs for Vercel production.
8. Create Sheets service account.
9. Download service-account credentials safely.
10. Share the private Google Sheet with ONLY the service account.
11. Configure Gmail sender authorization.
12. Configure required environment variables.

Be explicit that sender Gmail accounts should NOT be given access to the Google Sheet.


==================================================
15. SUPABASE SETUP DOCUMENTATION
==================================================

Create:

docs/SUPABASE_SETUP.md

Include:

- creating project
- applying migrations
- Supabase Auth setup
- creating first admin
- RLS explanation
- local environment variables
- production variables


==================================================
16. DEPLOYMENT
==================================================

Create:

docs/DEPLOYMENT.md

Target:

Vercel + Supabase

Explain:

- required environment variables
- Google OAuth production callback URL
- deployment commands
- Vercel cron configuration if used
- Supabase production setup
- how to safely switch:
  preview → draft → live

Never default production to LIVE.

Default:

EMAIL_MODE=preview


==================================================
17. ENVIRONMENT VARIABLES
==================================================

Create a .env.example similar to:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=

TOKEN_ENCRYPTION_KEY=

EMAIL_MODE=preview
EMAIL_BATCH_SIZE=5
RECIPIENT_GUARD_MODE=allowlist
TEST_RECIPIENT_ALLOWLIST=

APP_URL=http://localhost:3000


Adjust these if the implementation requires better names.


==================================================
18. TESTING
==================================================

Write meaningful tests.

At minimum test:

- template variable replacement
- balanced sender distribution
- suppression checks
- duplicate-send prevention
- invite expiration
- invite one-time-use behavior
- encrypted token storage/decryption
- preview mode never sends Gmail
- draft mode does not send
- live mode requires APPROVED/QUEUED state
- sender cannot access admin data
- invalid Google Sheet schema is rejected

Mock Google APIs in automated tests.

Never send real emails during the test suite.


==================================================
19. DEVELOPMENT SEED DATA
==================================================

Provide safe seed/demo data.

Use fake example.com emails.

Example:

Rose City Glam
rose.city.glam@example.com
Makeup Artists

Northwest Lens
northwest.lens@example.com
Wedding Photographers

Petal & Pine
petal.and.pine@example.com
Florists

Never seed real business email addresses.


==================================================
20. IMPLEMENTATION PROCESS
==================================================

Before writing code:

1. Inspect the existing repository.
2. Explain the current project structure.
3. Identify whether anything can be reused.
4. Create a concise implementation plan.
5. Then implement the application in logical phases.

If this repository already contains an application, do not unnecessarily rewrite working code or change the existing design without a reason.

Prefer small, understandable modules over one large file.

Suggested phases:

Phase 1
Project foundation + Supabase + admin auth

Phase 2
Database schema + RLS

Phase 3
Google Sheets importing

Phase 4
Sender invitations + Gmail OAuth

Phase 5
Campaign/template generation

Phase 6
Preview and approval workflow

Phase 7
Draft/live Gmail sending + queue

Phase 8
Suppression system

Phase 9
Testing

Phase 10
Documentation + deployment preparation


==================================================
21. MVP BOUNDARIES
==================================================

Do NOT implement these yet unless necessary:

- automatic Gmail inbox scanning
- automatic STOP reply detection
- AI-generated personalization
- open tracking pixels
- click tracking
- email scraping
- purchasing contact lists
- automatic discovery of businesses
- provider-limit bypassing
- account rotation designed to evade spam restrictions

The four Gmail accounts are legitimate authorized senders.

The system must respect Gmail/Google limits rather than trying to circumvent them.


==================================================
22. ACCEPTANCE CRITERIA
==================================================

The implementation is complete when I can:

1. Log into the app as an admin.

2. Add a Google Sheet that contains:

NAME
EMAIL
LINK
Business Type

3. Import and preview the recipients.

4. Create four sender connection invitations.

5. Give each sender ONLY their connection link.

6. Have each sender authorize Gmail without receiving access to:
   - the Sheet
   - dashboard
   - recipients
   - templates

7. See all four Gmail accounts listed as connected.

8. Create templates for different Business Types.

9. Automatically distribute recipients among sender accounts.

10. Generate personalized email previews.

11. Review/edit/approve emails.

12. Run in PREVIEW mode without Gmail sending anything.

13. Run in DRAFT mode and create Gmail drafts.

14. Run in LIVE mode only after explicitly enabling it.

15. See successful and failed sends in the dashboard.

16. Add an email to the suppression list and verify it can never be sent.

17. Deploy the application to Vercel.

18. Keep the original Google Sheet completely private from sender employees.


After implementation:

- Run linting.
- Run TypeScript checks.
- Run automated tests.
- Fix errors.
- Give me a concise summary of what was created.
- List important files.
- List required manual Google Cloud/Supabase configuration.
- Tell me exactly how to run the project locally.
- Do not claim something was tested if it was not actually tested.
