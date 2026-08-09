# Supabase setup — Phases 1–8

This app uses Supabase Auth for admins and Postgres RLS for every exposed table. Phase 4 adds a server-only service-role client for unauthenticated sender invitation/OAuth callbacks. It can call only explicitly granted connection RPCs and must never reach browser code.

## 1. Create and link a project

1. Create a hosted Supabase project and save its database password securely.
2. In **Project Settings → API Keys**, copy the project URL and **publishable** key.
3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
   ```

4. Authenticate and link the pinned project CLI:

   ```bash
   npm exec supabase -- login
   npm exec supabase -- link --project-ref YOUR_PROJECT_REF
   npm exec supabase -- db push --dry-run
   npm exec supabase -- db push
   npm exec supabase -- migration list
   ```

Do not run the development seed against production. `supabase/seed.sql` contains fake `example.com` data for local development only.

## 2. Configure Auth

1. In **Authentication → Providers → Email**, keep email/password enabled.
2. Disable public user signups. The app has no signup route, and local `supabase/config.toml` also disables signups.
3. Use strong passwords. Local config requires at least 12 characters with upper/lowercase letters and digits.
4. In **Authentication → URL Configuration**, set the site URL to `http://localhost:3000` for local development and add the final HTTPS production URL later.

## 3. Create the first admin

1. In **Authentication → Users**, use **Add user** to create the admin. Record its UUID.
2. Run this once in the SQL Editor, replacing the UUID:

   ```sql
   begin;

   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
     || '{"role":"admin"}'::jsonb
   where id = 'ADMIN_USER_UUID';

   insert into public.profiles (id, role)
   values ('ADMIN_USER_UUID', 'admin')
   on conflict (id) do update set role = excluded.role;

   commit;
   ```

3. Sign out and back in after changing app metadata so the JWT contains the fresh role claim.

Authorization must remain in `raw_app_meta_data` / `app_metadata`. Never put roles in user-editable `user_metadata`.

## 4. Security model

- `anon` receives no table grants.
- `authenticated` receives explicit table grants, then RLS permits only JWTs with `app_metadata.role = admin`.
- All public tables have RLS enabled.
- Invite token hashes, encrypted Gmail refresh tokens, and hashed OAuth states live in the unexposed `private` schema.
- Sender connection RPCs are granted only to `service_role`; admin workflow RPCs validate immutable `app_metadata.role = admin` and run through authenticated server actions.
- Sender Gmail accounts are not Supabase users and receive no authenticated database session.
- `create_campaign_with_recipients` is `SECURITY INVOKER`; it uses the caller's RLS permissions and commits campaign plus recipients atomically.
- `recipients` has a unique constraint on `(campaign_id, email)`.
- `email_queue.email_draft_id` is unique. Service-role-only queue RPCs use `FOR UPDATE SKIP LOCKED` and claim tokens; admins receive RLS-protected read access only.
- Scheduled instants are stored as `timestamptz` (UTC) with the chosen IANA timezone stored separately.
- Apply `20260809090305_phases_7_8.sql` before enabling the cron worker.

## 5. Optional local Supabase

Docker Desktop or another Docker-compatible runtime is required:

```bash
npm exec supabase -- start
npm exec supabase -- db reset
```

`db reset` recreates the local database, applies migrations, and runs safe seed data. It is destructive to the local database; never point it at production.
