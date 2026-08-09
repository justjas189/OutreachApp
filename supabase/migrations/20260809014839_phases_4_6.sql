alter table public.sender_invites
add column sender_account_id uuid references public.sender_accounts(id) on delete cascade;

create index sender_invites_sender_account_created_at_idx
  on public.sender_invites (sender_account_id, created_at desc)
  where sender_account_id is not null;

create table private.sender_oauth_states (
  id uuid primary key default extensions.gen_random_uuid(),
  sender_invite_id uuid not null references public.sender_invites(id) on delete cascade,
  state_hash text not null unique,
  encrypted_code_verifier text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sender_oauth_states_expiry_after_creation check (expires_at > created_at),
  constraint sender_oauth_states_used_after_creation check (used_at is null or used_at >= created_at)
);

create index sender_oauth_states_active_expiry_idx
  on private.sender_oauth_states (expires_at)
  where used_at is null;

alter table private.sender_oauth_states enable row level security;
revoke all on table private.sender_oauth_states from public, anon, authenticated;

alter table public.templates drop constraint if exists templates_business_type_key;
create unique index templates_business_type_normalized_unique
  on public.templates (lower(btrim(business_type)));

create function public.create_sender_invitation(
  p_sender_label text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(sender_account_id uuid, sender_invite_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_account_id uuid;
  v_sender_invite_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if length(btrim(p_sender_label)) < 2 or length(btrim(p_sender_label)) > 120 then
    raise exception 'sender label must contain 2 to 120 characters' using errcode = '22023';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token hash has an invalid format' using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'invite expiry must be within 30 days' using errcode = '22023';
  end if;

  insert into public.sender_accounts (display_name)
  values (btrim(p_sender_label))
  returning id into v_sender_account_id;

  insert into public.sender_invites (
    expires_at,
    created_by,
    sender_label,
    sender_account_id
  ) values (
    p_expires_at,
    auth.uid(),
    btrim(p_sender_label),
    v_sender_account_id
  )
  returning id into v_sender_invite_id;

  insert into private.sender_invite_tokens (sender_invite_id, token_hash)
  values (v_sender_invite_id, p_token_hash);

  return query select v_sender_account_id, v_sender_invite_id;
end;
$$;

revoke all on function public.create_sender_invitation(text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.create_sender_invitation(text, text, timestamptz)
to authenticated;

create function public.get_sender_invite_for_connection(p_token_hash text)
returns table(
  sender_invite_id uuid,
  sender_account_id uuid,
  sender_label text,
  expires_at timestamptz,
  used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invite.id,
    invite.sender_account_id,
    invite.sender_label,
    invite.expires_at,
    invite.used_at
  from private.sender_invite_tokens as token
  join public.sender_invites as invite on invite.id = token.sender_invite_id
  where token.token_hash = p_token_hash
  limit 1;
$$;

revoke all on function public.get_sender_invite_for_connection(text)
from public, anon, authenticated;
grant execute on function public.get_sender_invite_for_connection(text)
to service_role;

create function public.begin_sender_oauth(
  p_token_hash text,
  p_state_hash text,
  p_encrypted_code_verifier text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_state_id uuid;
begin
  if p_state_hash !~ '^[0-9a-f]{64}$' or length(p_encrypted_code_verifier) < 40 then
    raise exception 'OAuth state is invalid' using errcode = '22023';
  end if;

  select invite.id
  into v_invite_id
  from private.sender_invite_tokens as token
  join public.sender_invites as invite on invite.id = token.sender_invite_id
  where token.token_hash = p_token_hash
    and invite.sender_account_id is not null
    and invite.used_at is null
    and invite.expires_at > now()
  for update of invite;

  if v_invite_id is null then
    raise exception 'sender invitation is invalid or unavailable' using errcode = '22023';
  end if;

  if p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes'
    or p_expires_at > (select expires_at from public.sender_invites where id = v_invite_id)
  then
    raise exception 'OAuth state expiry is invalid' using errcode = '22023';
  end if;

  update private.sender_oauth_states
  set used_at = now()
  where sender_invite_id = v_invite_id and used_at is null;

  insert into private.sender_oauth_states (
    sender_invite_id,
    state_hash,
    encrypted_code_verifier,
    expires_at
  ) values (
    v_invite_id,
    p_state_hash,
    p_encrypted_code_verifier,
    p_expires_at
  )
  returning id into v_state_id;

  return v_state_id;
end;
$$;

revoke all on function public.begin_sender_oauth(text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.begin_sender_oauth(text, text, text, timestamptz)
to service_role;

create function public.consume_sender_oauth_state(p_state_hash text)
returns table(sender_invite_id uuid, encrypted_code_verifier text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update private.sender_oauth_states as oauth_state
  set used_at = now()
  where oauth_state.state_hash = p_state_hash
    and oauth_state.used_at is null
    and oauth_state.expires_at > now()
    and exists (
      select 1
      from public.sender_invites as invite
      where invite.id = oauth_state.sender_invite_id
        and invite.used_at is null
        and invite.expires_at > now()
    )
  returning oauth_state.sender_invite_id, oauth_state.encrypted_code_verifier;
end;
$$;

revoke all on function public.consume_sender_oauth_state(text)
from public, anon, authenticated;
grant execute on function public.consume_sender_oauth_state(text)
to service_role;

create function public.complete_sender_connection(
  p_sender_invite_id uuid,
  p_email text,
  p_google_account_id text,
  p_encrypted_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.sender_invites%rowtype;
begin
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(btrim(p_google_account_id)) = 0
    or length(p_encrypted_refresh_token) < 40
  then
    raise exception 'sender connection details are invalid' using errcode = '22023';
  end if;

  select *
  into v_invite
  from public.sender_invites
  where id = p_sender_invite_id
  for update;

  if v_invite.id is null
    or v_invite.sender_account_id is null
    or v_invite.used_at is not null
    or v_invite.expires_at <= now()
  then
    raise exception 'sender invitation is invalid or unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.sender_accounts
    where id <> v_invite.sender_account_id
      and (
        lower(email) = lower(btrim(p_email))
        or google_account_id = btrim(p_google_account_id)
      )
  ) then
    raise exception 'Google account is already connected' using errcode = '23505';
  end if;

  update public.sender_accounts
  set
    email = lower(btrim(p_email)),
    status = 'CONNECTED',
    google_account_id = btrim(p_google_account_id),
    connected_at = now(),
    revoked_at = null
  where id = v_invite.sender_account_id;

  insert into private.sender_credentials (
    sender_account_id,
    encrypted_refresh_token
  ) values (
    v_invite.sender_account_id,
    p_encrypted_refresh_token
  )
  on conflict (sender_account_id) do update
  set encrypted_refresh_token = excluded.encrypted_refresh_token,
      updated_at = now();

  update public.sender_invites
  set used_at = now()
  where id = v_invite.id;

  return v_invite.sender_account_id;
end;
$$;

revoke all on function public.complete_sender_connection(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.complete_sender_connection(uuid, text, text, text)
to service_role;

create function public.revoke_sender_connection(p_sender_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  delete from private.sender_credentials
  where sender_account_id = p_sender_account_id;

  update public.sender_accounts
  set status = 'REVOKED', revoked_at = now()
  where id = p_sender_account_id and status = 'CONNECTED';

  return found;
end;
$$;

revoke all on function public.revoke_sender_connection(uuid)
from public, anon, authenticated;
grant execute on function public.revoke_sender_connection(uuid)
to authenticated;

create function public.assign_campaign_senders(
  p_campaign_id uuid,
  p_sender_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipient_count integer;
  v_sender_count integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  v_sender_count := cardinality(p_sender_ids);
  if v_sender_count is null or v_sender_count = 0 then
    raise exception 'select at least one connected sender' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(p_sender_ids) as sender_id where sender_id is null)
    or (select count(distinct sender_id) from unnest(p_sender_ids) as sender_id) <> v_sender_count
  then
    raise exception 'sender selection contains invalid entries' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.sender_accounts
    where id = any(p_sender_ids) and status = 'CONNECTED'
  ) <> v_sender_count then
    raise exception 'only connected senders can be assigned' using errcode = '22023';
  end if;

  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.email_drafts where campaign_id = p_campaign_id) then
    raise exception 'sender assignment is locked after preview generation' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.recipients
    where campaign_id = p_campaign_id and status <> 'PENDING'
  ) then
    raise exception 'sender assignment requires pending recipients' using errcode = '22023';
  end if;

  with ranked_recipients as (
    select
      id,
      row_number() over (order by created_at, id) - 1 as position
    from public.recipients
    where campaign_id = p_campaign_id
  ), balanced as (
    select
      id,
      p_sender_ids[(position % v_sender_count) + 1] as sender_account_id
    from ranked_recipients
  )
  update public.recipients as recipient
  set assigned_sender_id = balanced.sender_account_id
  from balanced
  where recipient.id = balanced.id;

  get diagnostics v_recipient_count = row_count;
  return v_recipient_count;
end;
$$;

revoke all on function public.assign_campaign_senders(uuid, uuid[])
from public, anon;
grant execute on function public.assign_campaign_senders(uuid, uuid[])
to authenticated;

create function public.store_generated_email_previews(
  p_campaign_id uuid,
  p_drafts jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_draft_count integer;
  v_valid_count integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_drafts is null or jsonb_typeof(p_drafts) <> 'array'
    or jsonb_array_length(p_drafts) = 0
    or jsonb_array_length(p_drafts) > 10000
  then
    raise exception 'drafts must be an array containing 1 to 10000 entries' using errcode = '22023';
  end if;

  select count(*)
  into v_draft_count
  from jsonb_to_recordset(p_drafts) as draft(
    recipient_id uuid,
    sender_account_id uuid,
    subject text,
    body text
  );

  if (
    select count(distinct draft.recipient_id)
    from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid)
  ) <> v_draft_count then
    raise exception 'draft recipients must be unique' using errcode = '22023';
  end if;

  select count(*)
  into v_valid_count
  from jsonb_to_recordset(p_drafts) as draft(
    recipient_id uuid,
    sender_account_id uuid,
    subject text,
    body text
  )
  join public.recipients as recipient
    on recipient.id = draft.recipient_id
    and recipient.campaign_id = p_campaign_id
    and recipient.status in ('PENDING', 'GENERATED')
    and recipient.assigned_sender_id = draft.sender_account_id
  join public.sender_accounts as sender
    on sender.id = draft.sender_account_id
    and sender.status = 'CONNECTED'
  where length(btrim(draft.subject)) between 1 and 200
    and draft.subject !~ E'[\r\n]'
    and length(draft.body) between 1 and 50000;

  if v_valid_count <> v_draft_count then
    raise exception 'draft entries do not match eligible recipients and connected senders' using errcode = '22023';
  end if;

  insert into public.email_drafts (
    campaign_id,
    recipient_id,
    sender_account_id,
    subject,
    body,
    status
  )
  select
    p_campaign_id,
    draft.recipient_id,
    draft.sender_account_id,
    btrim(draft.subject),
    draft.body,
    'GENERATED'
  from jsonb_to_recordset(p_drafts) as draft(
    recipient_id uuid,
    sender_account_id uuid,
    subject text,
    body text
  )
  on conflict (recipient_id) do update
  set sender_account_id = excluded.sender_account_id,
      subject = excluded.subject,
      body = excluded.body,
      status = 'GENERATED',
      gmail_draft_id = null,
      created_at = now(),
      approved_at = null,
      sent_at = null
  where public.email_drafts.status = 'GENERATED';

  update public.recipients as recipient
  set status = 'GENERATED', last_error = null
  where recipient.campaign_id = p_campaign_id
    and recipient.id in (
      select draft.recipient_id
      from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid)
    );

  return v_draft_count;
end;
$$;

revoke all on function public.store_generated_email_previews(uuid, jsonb)
from public, anon;
grant execute on function public.store_generated_email_previews(uuid, jsonb)
to authenticated;

create function public.approve_email_preview(
  p_email_draft_id uuid,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipient_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if length(btrim(p_subject)) not between 1 and 200
    or p_subject ~ E'[\r\n]'
    or length(p_body) not between 1 and 50000
  then
    raise exception 'email preview content is invalid' using errcode = '22023';
  end if;

  update public.email_drafts
  set
    subject = btrim(p_subject),
    body = p_body,
    status = 'APPROVED',
    approved_at = now()
  where id = p_email_draft_id and status = 'GENERATED'
  returning recipient_id into v_recipient_id;

  if v_recipient_id is null then
    raise exception 'generated email preview not found' using errcode = 'P0002';
  end if;

  update public.recipients
  set status = 'APPROVED'
  where id = v_recipient_id and status = 'GENERATED';

  return v_recipient_id;
end;
$$;

revoke all on function public.approve_email_preview(uuid, text, text)
from public, anon;
grant execute on function public.approve_email_preview(uuid, text, text)
to authenticated;

create function public.approve_campaign_email_previews(p_campaign_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_approved_count integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  with approved_drafts as (
    update public.email_drafts
    set status = 'APPROVED', approved_at = now()
    where campaign_id = p_campaign_id and status = 'GENERATED'
    returning recipient_id
  ), approved_recipients as (
    update public.recipients as recipient
    set status = 'APPROVED'
    from approved_drafts
    where recipient.id = approved_drafts.recipient_id
      and recipient.status = 'GENERATED'
    returning recipient.id
  )
  select count(*) into v_approved_count from approved_recipients;

  return v_approved_count;
end;
$$;

revoke all on function public.approve_campaign_email_previews(uuid)
from public, anon;
grant execute on function public.approve_campaign_email_previews(uuid)
to authenticated;

comment on table private.sender_oauth_states is
  'One-time, expiring OAuth state hashes and encrypted PKCE verifiers. Never exposed through the Data API.';
comment on function public.create_sender_invitation(text, text, timestamptz) is
  'Creates a sender slot plus one-time invitation atomically for an authenticated admin.';
comment on function public.store_generated_email_previews(uuid, jsonb) is
  'Stores deterministic email previews only. This function never calls Gmail.';
