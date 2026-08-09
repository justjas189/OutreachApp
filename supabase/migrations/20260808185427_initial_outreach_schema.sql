create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin');
create type public.sender_status as enum ('PENDING', 'CONNECTED', 'REVOKED');
create type public.campaign_status as enum ('DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
create type public.recipient_status as enum ('PENDING', 'GENERATED', 'APPROVED', 'QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');
create type public.draft_status as enum ('GENERATED', 'APPROVED', 'QUEUED', 'SENT', 'FAILED');
create type public.send_log_status as enum ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.sender_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  email text,
  display_name text not null,
  status public.sender_status not null default 'PENDING',
  google_account_id text,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sender_accounts_email_normalized check (
    email is null or email = lower(btrim(email))
  ),
  constraint sender_accounts_connection_consistent check (
    (status = 'CONNECTED' and email is not null and connected_at is not null and revoked_at is null)
    or (status = 'REVOKED' and revoked_at is not null)
    or (status = 'PENDING' and connected_at is null)
  )
);

create unique index sender_accounts_email_unique
  on public.sender_accounts (lower(email))
  where email is not null;
create unique index sender_accounts_google_account_id_unique
  on public.sender_accounts (google_account_id)
  where google_account_id is not null;

create table public.sender_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  sender_label text not null,
  created_at timestamptz not null default now(),
  constraint sender_invites_label_not_blank check (length(btrim(sender_label)) > 0),
  constraint sender_invites_used_after_created check (used_at is null or used_at >= created_at)
);

create table private.sender_credentials (
  sender_account_id uuid primary key references public.sender_accounts(id) on delete cascade,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table private.sender_invite_tokens (
  sender_invite_id uuid primary key references public.sender_invites(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

revoke all on private.sender_credentials from public, anon, authenticated;
revoke all on private.sender_invite_tokens from public, anon, authenticated;

create table public.campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  city text not null,
  status public.campaign_status not null default 'DRAFT',
  google_sheet_id text,
  worksheet_name text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint campaigns_name_not_blank check (length(btrim(name)) > 0),
  constraint campaigns_city_not_blank check (length(btrim(city)) > 0),
  constraint campaigns_sheet_pair check (
    (google_sheet_id is null and worksheet_name is null)
    or (google_sheet_id is not null and worksheet_name is not null)
  )
);

create table public.recipients (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  email text not null,
  link text not null,
  business_type text not null,
  assigned_sender_id uuid references public.sender_accounts(id) on delete set null,
  status public.recipient_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  constraint recipients_name_not_blank check (length(btrim(name)) > 0),
  constraint recipients_email_normalized check (email = lower(btrim(email))),
  constraint recipients_email_shape check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint recipients_link_not_blank check (length(btrim(link)) > 0),
  constraint recipients_business_type_not_blank check (length(btrim(business_type)) > 0),
  constraint recipients_sent_consistent check (
    (status = 'SENT' and sent_at is not null) or status <> 'SENT'
  ),
  unique (campaign_id, email)
);

create table public.templates (
  id uuid primary key default extensions.gen_random_uuid(),
  business_type text not null,
  guide_title text not null,
  audience text not null,
  services_focus text not null,
  body_template text not null,
  subject_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_business_type_not_blank check (length(btrim(business_type)) > 0),
  unique (business_type)
);

create table public.email_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  sender_account_id uuid references public.sender_accounts(id) on delete set null,
  subject text not null,
  body text not null,
  status public.draft_status not null default 'GENERATED',
  gmail_draft_id text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  unique (recipient_id),
  constraint email_drafts_approval_consistent check (
    status not in ('APPROVED', 'QUEUED', 'SENT') or approved_at is not null
  ),
  constraint email_drafts_sent_consistent check (
    status <> 'SENT' or sent_at is not null
  )
);

create table public.suppression_list (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null unique,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint suppression_email_normalized check (email = lower(btrim(email))),
  constraint suppression_email_shape check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.send_logs (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  sender_account_id uuid references public.sender_accounts(id) on delete set null,
  status public.send_log_status not null,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index campaigns_created_by_created_at_idx
  on public.campaigns (created_by, created_at desc);
create index campaigns_status_idx on public.campaigns (status);
create index recipients_campaign_status_idx on public.recipients (campaign_id, status);
create index recipients_assigned_sender_status_idx
  on public.recipients (assigned_sender_id, status)
  where assigned_sender_id is not null;
create index email_drafts_campaign_status_idx on public.email_drafts (campaign_id, status);
create index email_drafts_sender_status_idx
  on public.email_drafts (sender_account_id, status)
  where sender_account_id is not null;
create index send_logs_campaign_created_at_idx on public.send_logs (campaign_id, created_at desc);
create index send_logs_recipient_created_at_idx on public.send_logs (recipient_id, created_at desc);
create index sender_invites_expires_at_idx on public.sender_invites (expires_at)
  where used_at is null;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger templates_set_updated_at
before update on public.templates
for each row execute function private.set_updated_at();

create trigger sender_credentials_set_updated_at
before update on private.sender_credentials
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.sender_accounts enable row level security;
alter table public.sender_invites enable row level security;
alter table public.campaigns enable row level security;
alter table public.recipients enable row level security;
alter table public.templates enable row level security;
alter table public.email_drafts enable row level security;
alter table public.suppression_list enable row level security;
alter table public.send_logs enable row level security;
alter table private.sender_credentials enable row level security;
alter table private.sender_invite_tokens enable row level security;

revoke all on table
  public.profiles,
  public.sender_accounts,
  public.sender_invites,
  public.campaigns,
  public.recipients,
  public.templates,
  public.email_drafts,
  public.suppression_list,
  public.send_logs
from anon, authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.sender_accounts,
  public.sender_invites,
  public.campaigns,
  public.recipients,
  public.templates,
  public.email_drafts,
  public.suppression_list,
  public.send_logs
to authenticated;
grant usage, select on sequence public.send_logs_id_seq to authenticated;

create policy "admins manage profiles"
on public.profiles for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage sender accounts"
on public.sender_accounts for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage sender invites"
on public.sender_invites for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage campaigns"
on public.campaigns for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage recipients"
on public.recipients for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage templates"
on public.templates for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage email drafts"
on public.email_drafts for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage suppression list"
on public.suppression_list for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins manage send logs"
on public.send_logs for all to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create function public.create_campaign_with_recipients(
  p_name text,
  p_city text,
  p_google_sheet_id text,
  p_worksheet_name text,
  p_recipients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_recipients is null or jsonb_typeof(p_recipients) <> 'array' then
    raise exception 'recipients must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_recipients) = 0 or jsonb_array_length(p_recipients) > 10000 then
    raise exception 'recipient count must be between 1 and 10000' using errcode = '22023';
  end if;

  insert into public.campaigns (
    name,
    city,
    status,
    google_sheet_id,
    worksheet_name,
    created_by
  ) values (
    btrim(p_name),
    btrim(p_city),
    'READY',
    p_google_sheet_id,
    p_worksheet_name,
    auth.uid()
  ) returning id into v_campaign_id;

  insert into public.recipients (
    campaign_id,
    name,
    email,
    link,
    business_type
  )
  select
    v_campaign_id,
    btrim(source.name),
    lower(btrim(source.email)),
    btrim(source.link),
    btrim(source.business_type)
  from jsonb_to_recordset(p_recipients) as source(
    name text,
    email text,
    link text,
    business_type text
  );

  return v_campaign_id;
end;
$$;

revoke all on function public.create_campaign_with_recipients(text, text, text, text, jsonb)
from public, anon;
grant execute on function public.create_campaign_with_recipients(text, text, text, text, jsonb)
to authenticated;

comment on schema private is 'Server-only secrets excluded from the Supabase Data API.';
comment on table private.sender_credentials is 'Encrypted Gmail credentials for later phases; never query from a browser client.';
comment on function public.create_campaign_with_recipients(text, text, text, text, jsonb)
is 'Atomically creates a campaign and its normalized, unique recipients for an authenticated admin.';
