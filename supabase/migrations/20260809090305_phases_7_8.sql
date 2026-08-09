create type public.email_queue_status as enum (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

create type public.email_delivery_mode as enum ('draft', 'live');

-- Replace the draft enum transactionally so suppressed previews have an explicit state.
create type public.draft_status_v2 as enum (
  'GENERATED', 'APPROVED', 'QUEUED', 'SENT', 'FAILED', 'SUPPRESSED'
);
alter table public.email_drafts drop constraint email_drafts_approval_consistent;
alter table public.email_drafts drop constraint email_drafts_sent_consistent;
alter table public.email_drafts
  alter column status drop default,
  alter column status type public.draft_status_v2 using status::text::public.draft_status_v2,
  alter column status set default 'GENERATED';
drop type public.draft_status;
alter type public.draft_status_v2 rename to draft_status;
alter table public.email_drafts
  add constraint email_drafts_approval_consistent check (
    status not in ('APPROVED', 'QUEUED', 'SENT') or approved_at is not null
  ),
  add constraint email_drafts_sent_consistent check (
    status <> 'SENT' or sent_at is not null
  );

create type public.send_log_status_v2 as enum (
  'QUEUED', 'DRAFTED', 'SENT', 'RETRY', 'FAILED', 'SUPPRESSED', 'SKIPPED'
);
alter table public.send_logs
  alter column status type public.send_log_status_v2 using status::text::public.send_log_status_v2;
drop type public.send_log_status;
alter type public.send_log_status_v2 rename to send_log_status;

alter table public.campaigns
  add column scheduled_at timestamptz,
  add column schedule_timezone text,
  add column paused_at timestamptz,
  add constraint campaigns_schedule_pair check (
    (scheduled_at is null and schedule_timezone is null)
    or (scheduled_at is not null and length(btrim(schedule_timezone)) between 1 and 100)
  );

alter table public.suppression_list
  add constraint suppression_reason_allowed check (
    reason in ('STOP', 'UNSUBSCRIBED', 'INVALID', 'MANUAL BLOCK')
  ),
  add constraint suppression_source_not_blank check (length(btrim(source)) between 1 and 80);

create table public.email_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  email_draft_id uuid not null unique references public.email_drafts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  sender_account_id uuid not null references public.sender_accounts(id) on delete restrict,
  delivery_mode public.email_delivery_mode not null,
  status public.email_queue_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  claim_token uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_queue_attempts_valid check (
    attempts between 0 and max_attempts and max_attempts between 1 and 10
  ),
  constraint email_queue_claim_consistent check (
    (status = 'PROCESSING' and claim_token is not null and claimed_at is not null)
    or (status <> 'PROCESSING' and claim_token is null and claimed_at is null)
  ),
  constraint email_queue_completion_consistent check (
    (status in ('COMPLETED', 'FAILED', 'CANCELLED') and completed_at is not null)
    or (status not in ('COMPLETED', 'FAILED', 'CANCELLED') and completed_at is null)
  )
);

create index campaigns_scheduled_eligible_idx
  on public.campaigns (scheduled_at, id)
  where status = 'READY' and scheduled_at is not null;
create index recipients_email_unsent_idx
  on public.recipients (email, campaign_id)
  where status <> 'SENT';
create index email_queue_claim_idx
  on public.email_queue (sender_account_id, available_at, created_at, id)
  where status in ('PENDING', 'RETRY');
create index email_queue_campaign_status_idx
  on public.email_queue (campaign_id, status);
create index email_queue_recipient_idx on public.email_queue (recipient_id);

create trigger email_queue_set_updated_at
before update on public.email_queue
for each row execute function private.set_updated_at();

alter table public.email_queue enable row level security;
revoke all on table public.email_queue from anon, authenticated;
grant select on table public.email_queue to authenticated;
grant select, insert, update, delete on table public.email_queue to service_role;

create policy "admins view email queue"
on public.email_queue for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create function public.schedule_campaign(
  p_campaign_id uuid,
  p_scheduled_at timestamptz,
  p_schedule_timezone text
)
returns public.campaign_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.campaign_status;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_scheduled_at is null
    or p_scheduled_at < now() - interval '5 minutes'
    or length(btrim(p_schedule_timezone)) not between 1 and 100
  then
    raise exception 'campaign schedule is invalid' using errcode = '22023';
  end if;

  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.email_queue where campaign_id = p_campaign_id)
    or exists (select 1 from public.campaigns where id = p_campaign_id and started_at is not null)
  then
    raise exception 'campaign schedule is locked after processing starts' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.email_drafts
    where campaign_id = p_campaign_id and status = 'APPROVED'
  ) then
    raise exception 'approve at least one email before scheduling' using errcode = '22023';
  end if;

  v_status := case
    when p_scheduled_at <= now() then 'ACTIVE'::public.campaign_status
    else 'READY'::public.campaign_status
  end;
  update public.campaigns
  set status = v_status,
      scheduled_at = p_scheduled_at,
      schedule_timezone = btrim(p_schedule_timezone),
      paused_at = null,
      completed_at = null
  where id = p_campaign_id;
  return v_status;
end;
$$;

create function public.cancel_campaign_schedule(p_campaign_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.campaigns
  set status = 'READY', scheduled_at = null, schedule_timezone = null, paused_at = null
  where id = p_campaign_id
    and started_at is null
    and scheduled_at > now()
    and not exists (select 1 from public.email_queue where campaign_id = p_campaign_id);
  return found;
end;
$$;

create function public.pause_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.campaigns
  set status = 'PAUSED', paused_at = now()
  where id = p_campaign_id and scheduled_at is not null and status in ('READY', 'ACTIVE');
  return found;
end;
$$;

create function public.resume_campaign(p_campaign_id uuid)
returns public.campaign_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.campaign_status;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select case when scheduled_at <= now() then 'ACTIVE'::public.campaign_status else 'READY'::public.campaign_status end
  into v_status
  from public.campaigns
  where id = p_campaign_id and status = 'PAUSED' and scheduled_at is not null
  for update;
  if v_status is null then
    raise exception 'paused campaign not found' using errcode = 'P0002';
  end if;
  update public.campaigns set status = v_status, paused_at = null where id = p_campaign_id;
  return v_status;
end;
$$;

create function public.apply_campaign_suppressions(p_campaign_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  with suppressed_recipients as (
    update public.recipients as recipient
    set status = 'SUPPRESSED', sent_at = null, last_error = null
    where recipient.campaign_id = p_campaign_id
      and recipient.status <> 'SENT'
      and exists (select 1 from public.suppression_list as suppression where suppression.email = recipient.email)
    returning recipient.id
  ), suppressed_drafts as (
    update public.email_drafts as draft
    set status = 'SUPPRESSED'
    from suppressed_recipients
    where draft.recipient_id = suppressed_recipients.id and draft.status <> 'SENT'
  )
  select count(*) into v_count from suppressed_recipients;
  return v_count;
end;
$$;

create function public.add_suppression_entry(p_email text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_reason not in ('STOP', 'UNSUBSCRIBED', 'INVALID', 'MANUAL BLOCK')
  then
    raise exception 'suppression entry is invalid' using errcode = '22023';
  end if;

  insert into public.suppression_list (email, reason, source)
  values (v_email, p_reason, 'MANUAL')
  on conflict (email) do update set reason = excluded.reason, source = 'MANUAL'
  returning id into v_id;

  update public.recipients
  set status = 'SUPPRESSED', sent_at = null, last_error = null
  where email = v_email and status <> 'SENT';
  update public.email_drafts as draft
  set status = 'SUPPRESSED'
  from public.recipients as recipient
  where recipient.id = draft.recipient_id
    and recipient.email = v_email
    and draft.status <> 'SENT';
  update public.email_queue as queue
  set status = 'CANCELLED', completed_at = now(), claim_token = null, claimed_at = null,
      last_error_code = 'suppressed', last_error_message = 'Recipient is suppressed.'
  from public.recipients as recipient
  where recipient.id = queue.recipient_id
    and recipient.email = v_email
    and queue.status in ('PENDING', 'RETRY', 'PROCESSING');
  return v_id;
end;
$$;

create function public.remove_suppression_entry(p_suppression_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  delete from public.suppression_list where id = p_suppression_id;
  return found;
end;
$$;

create function public.enqueue_due_campaign_emails(p_delivery_mode public.email_delivery_mode)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.campaigns
  set status = 'ACTIVE', started_at = coalesce(started_at, now())
  where status = 'READY' and scheduled_at <= now();

  update public.recipients as recipient
  set status = 'SUPPRESSED', sent_at = null, last_error = null
  where recipient.status <> 'SENT'
    and exists (select 1 from public.suppression_list as suppression where suppression.email = recipient.email);
  update public.email_drafts as draft
  set status = 'SUPPRESSED'
  from public.recipients as recipient
  where recipient.id = draft.recipient_id
    and recipient.status = 'SUPPRESSED'
    and draft.status <> 'SENT';

  with inserted as (
    insert into public.email_queue (
      email_draft_id, campaign_id, recipient_id, sender_account_id, delivery_mode, available_at
    )
    select draft.id, draft.campaign_id, draft.recipient_id, draft.sender_account_id, p_delivery_mode, campaign.scheduled_at
    from public.email_drafts as draft
    join public.campaigns as campaign on campaign.id = draft.campaign_id
    join public.recipients as recipient on recipient.id = draft.recipient_id
    join public.sender_accounts as sender on sender.id = draft.sender_account_id
    where campaign.status = 'ACTIVE'
      and campaign.scheduled_at <= now()
      and campaign.paused_at is null
      and draft.status = 'APPROVED'
      and recipient.status = 'APPROVED'
      and recipient.sent_at is null
      and sender.status = 'CONNECTED'
      and not exists (select 1 from public.suppression_list as suppression where suppression.email = recipient.email)
    on conflict (email_draft_id) do nothing
    returning email_draft_id, recipient_id
  ), queued_drafts as (
    update public.email_drafts as draft
    set status = 'QUEUED'
    from inserted
    where draft.id = inserted.email_draft_id and draft.status = 'APPROVED'
    returning inserted.recipient_id
  ), queued_recipients as (
    update public.recipients as recipient
    set status = 'QUEUED', last_error = null
    from queued_drafts
    where recipient.id = queued_drafts.recipient_id and recipient.status = 'APPROVED'
    returning recipient.id
  )
  select count(*) into v_count from queued_recipients;
  return v_count;
end;
$$;

create function public.claim_email_queue(
  p_delivery_mode public.email_delivery_mode,
  p_batch_size integer,
  p_claim_token uuid
)
returns table(queue_id uuid, delivery_mode public.email_delivery_mode)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size not between 1 and 50 or p_claim_token is null then
    raise exception 'queue claim parameters are invalid' using errcode = '22023';
  end if;

  with expired as (
    update public.email_queue
    set status = case when attempts >= max_attempts then 'FAILED'::public.email_queue_status else 'RETRY'::public.email_queue_status end,
        available_at = now(),
        completed_at = case when attempts >= max_attempts then now() else null end,
        claim_token = null,
        claimed_at = null,
        last_error_code = 'stale_claim',
        last_error_message = 'A previous worker claim expired.'
    where status = 'PROCESSING' and claimed_at < now() - interval '15 minutes'
    returning campaign_id, recipient_id, sender_account_id, email_draft_id, status
  ), failed_drafts as (
    update public.email_drafts as draft
    set status = 'FAILED'
    from expired
    where expired.status = 'FAILED' and draft.id = expired.email_draft_id and draft.status = 'QUEUED'
  ), failed_recipients as (
    update public.recipients as recipient
    set status = 'FAILED', last_error = 'A previous worker claim expired.'
    from expired
    where expired.status = 'FAILED' and recipient.id = expired.recipient_id and recipient.status = 'QUEUED'
  )
  insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, error_message)
  select campaign_id, recipient_id, sender_account_id,
    case when status = 'FAILED' then 'FAILED'::public.send_log_status else 'RETRY'::public.send_log_status end,
    'A previous worker claim expired.'
  from expired;

  return query
  with candidates as (
    select candidate.id
    from public.sender_accounts as sender
    cross join lateral (
      select queue.id
      from public.email_queue as queue
      join public.campaigns as campaign on campaign.id = queue.campaign_id
      join public.email_drafts as draft on draft.id = queue.email_draft_id
      join public.recipients as recipient on recipient.id = queue.recipient_id
      where queue.sender_account_id = sender.id
        and queue.delivery_mode = p_delivery_mode
        and queue.status in ('PENDING', 'RETRY')
        and queue.available_at <= now()
        and queue.attempts < queue.max_attempts
        and campaign.status = 'ACTIVE'
        and campaign.scheduled_at <= now()
        and campaign.paused_at is null
        and draft.status = 'QUEUED'
        and recipient.status = 'QUEUED'
        and recipient.sent_at is null
      order by queue.available_at, queue.created_at, queue.id
      for update of queue skip locked
      limit p_batch_size
    ) as candidate
    where sender.status = 'CONNECTED'
  ), claimed as (
    update public.email_queue as queue
    set status = 'PROCESSING', attempts = attempts + 1,
        claim_token = p_claim_token, claimed_at = now(),
        last_error_code = null, last_error_message = null
    from candidates
    where queue.id = candidates.id
    returning queue.id, queue.delivery_mode
  )
  select claimed.id, claimed.delivery_mode from claimed;
end;
$$;

create function public.prepare_claimed_email(p_queue_id uuid, p_claim_token uuid)
returns table(
  queue_id uuid,
  delivery_mode public.email_delivery_mode,
  recipient_email text,
  sender_email text,
  subject text,
  body text,
  encrypted_refresh_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.email_queue%rowtype;
  v_recipient public.recipients%rowtype;
  v_draft public.email_drafts%rowtype;
  v_sender public.sender_accounts%rowtype;
  v_campaign public.campaigns%rowtype;
  v_token text;
begin
  select * into v_queue from public.email_queue
  where id = p_queue_id and status = 'PROCESSING' and claim_token = p_claim_token
  for update;
  if v_queue.id is null then return; end if;

  select * into v_recipient from public.recipients where id = v_queue.recipient_id;
  select * into v_draft from public.email_drafts where id = v_queue.email_draft_id;
  select * into v_sender from public.sender_accounts where id = v_queue.sender_account_id;
  select * into v_campaign from public.campaigns where id = v_queue.campaign_id;

  if exists (select 1 from public.suppression_list where email = v_recipient.email)
    or v_recipient.status = 'SUPPRESSED'
  then
    update public.recipients set status = 'SUPPRESSED', sent_at = null, last_error = null where id = v_recipient.id and status <> 'SENT';
    update public.email_drafts set status = 'SUPPRESSED' where id = v_draft.id and status <> 'SENT';
    update public.email_queue set status = 'CANCELLED', completed_at = now(), claim_token = null, claimed_at = null,
      last_error_code = 'suppressed', last_error_message = 'Recipient is suppressed.' where id = v_queue.id;
    insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, error_message)
    values (v_queue.campaign_id, v_queue.recipient_id, v_queue.sender_account_id, 'SUPPRESSED', 'Recipient is suppressed.');
    return;
  end if;

  if v_campaign.status <> 'ACTIVE' or v_campaign.paused_at is not null or v_campaign.scheduled_at > now()
    or v_sender.status <> 'CONNECTED' or v_recipient.status <> 'QUEUED'
    or v_draft.status <> 'QUEUED' or v_recipient.sent_at is not null
  then
    update public.email_queue set status = 'RETRY', available_at = now() + interval '5 minutes',
      attempts = greatest(attempts - 1, 0),
      claim_token = null, claimed_at = null, last_error_code = 'not_eligible',
      last_error_message = 'Queue item is temporarily ineligible.' where id = v_queue.id;
    return;
  end if;

  select credentials.encrypted_refresh_token into v_token
  from private.sender_credentials as credentials
  where credentials.sender_account_id = v_sender.id;
  if v_token is null then
    update public.email_queue set status = 'FAILED', completed_at = now(), claim_token = null, claimed_at = null,
      last_error_code = 'sender_credentials_missing', last_error_message = 'Sender credentials are unavailable.' where id = v_queue.id;
    update public.email_drafts set status = 'FAILED' where id = v_draft.id;
    update public.recipients set status = 'FAILED', last_error = 'Sender credentials are unavailable.' where id = v_recipient.id;
    insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, error_message)
    values (v_queue.campaign_id, v_queue.recipient_id, v_queue.sender_account_id, 'FAILED', 'Sender credentials are unavailable.');
    return;
  end if;

  return query select v_queue.id, v_queue.delivery_mode, v_recipient.email, v_sender.email,
    v_draft.subject, v_draft.body, v_token;
end;
$$;

create function public.complete_email_queue_success(
  p_queue_id uuid,
  p_claim_token uuid,
  p_provider_message_id text,
  p_gmail_draft_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.email_queue%rowtype;
begin
  select * into v_queue from public.email_queue
  where id = p_queue_id and status = 'PROCESSING' and claim_token = p_claim_token
  for update;
  if v_queue.id is null then return false; end if;

  update public.email_queue set status = 'COMPLETED', completed_at = now(), claim_token = null, claimed_at = null where id = v_queue.id;
  if v_queue.delivery_mode = 'draft' then
    update public.email_drafts set status = 'APPROVED', gmail_draft_id = p_gmail_draft_id where id = v_queue.email_draft_id and status = 'QUEUED';
    update public.recipients set status = 'APPROVED' where id = v_queue.recipient_id and status = 'QUEUED';
    insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, provider_message_id)
    values (v_queue.campaign_id, v_queue.recipient_id, v_queue.sender_account_id, 'DRAFTED', p_provider_message_id);
  else
    update public.email_drafts set status = 'SENT', sent_at = now(), gmail_draft_id = null where id = v_queue.email_draft_id and status = 'QUEUED';
    update public.recipients set status = 'SENT', sent_at = now(), last_error = null where id = v_queue.recipient_id and status = 'QUEUED';
    insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, provider_message_id)
    values (v_queue.campaign_id, v_queue.recipient_id, v_queue.sender_account_id, 'SENT', p_provider_message_id);
  end if;
  return true;
end;
$$;

create function public.complete_email_queue_failure(
  p_queue_id uuid,
  p_claim_token uuid,
  p_transient boolean,
  p_error_code text,
  p_error_message text
)
returns public.email_queue_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.email_queue%rowtype;
  v_status public.email_queue_status;
begin
  select * into v_queue from public.email_queue
  where id = p_queue_id and status = 'PROCESSING' and claim_token = p_claim_token
  for update;
  if v_queue.id is null then raise exception 'active queue claim not found' using errcode = 'P0002'; end if;
  if length(p_error_code) not between 1 and 80 or length(p_error_message) not between 1 and 500 then
    raise exception 'safe queue error is invalid' using errcode = '22023';
  end if;

  v_status := case
    when p_transient and v_queue.attempts < v_queue.max_attempts then 'RETRY'::public.email_queue_status
    else 'FAILED'::public.email_queue_status
  end;
  update public.email_queue
  set status = v_status,
      available_at = case when v_status = 'RETRY' then now() + make_interval(secs => least(3600, 30 * power(2, greatest(attempts - 1, 0))::integer)) else available_at end,
      completed_at = case when v_status = 'FAILED' then now() else null end,
      claim_token = null, claimed_at = null,
      last_error_code = p_error_code, last_error_message = p_error_message
  where id = v_queue.id;

  if v_status = 'FAILED' then
    update public.email_drafts set status = 'FAILED' where id = v_queue.email_draft_id and status = 'QUEUED';
    update public.recipients set status = 'FAILED', last_error = p_error_message where id = v_queue.recipient_id and status = 'QUEUED';
  end if;
  insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, error_message)
  values (v_queue.campaign_id, v_queue.recipient_id, v_queue.sender_account_id,
    case when v_status = 'RETRY' then 'RETRY'::public.send_log_status else 'FAILED'::public.send_log_status end,
    p_error_message);
  return v_status;
end;
$$;

create function public.complete_finished_campaigns()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with completed as (
    update public.campaigns as campaign
    set status = 'COMPLETED', completed_at = now()
    where campaign.status = 'ACTIVE'
      and exists (select 1 from public.email_queue as queue where queue.campaign_id = campaign.id)
      and not exists (
        select 1 from public.email_queue as queue
        where queue.campaign_id = campaign.id and queue.status in ('PENDING', 'PROCESSING', 'RETRY')
      )
    returning campaign.id
  ) select count(*) into v_count from completed;
  return v_count;
end;
$$;

revoke all on function public.schedule_campaign(uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_campaign_schedule(uuid) from public, anon;
revoke all on function public.pause_campaign(uuid) from public, anon;
revoke all on function public.resume_campaign(uuid) from public, anon;
revoke all on function public.apply_campaign_suppressions(uuid) from public, anon;
revoke all on function public.add_suppression_entry(text, text) from public, anon, authenticated;
revoke all on function public.remove_suppression_entry(uuid) from public, anon;
grant execute on function public.schedule_campaign(uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_campaign_schedule(uuid) to authenticated;
grant execute on function public.pause_campaign(uuid) to authenticated;
grant execute on function public.resume_campaign(uuid) to authenticated;
grant execute on function public.apply_campaign_suppressions(uuid) to authenticated;
grant execute on function public.add_suppression_entry(text, text) to authenticated;
grant execute on function public.remove_suppression_entry(uuid) to authenticated;

revoke all on function public.enqueue_due_campaign_emails(public.email_delivery_mode) from public, anon, authenticated;
revoke all on function public.claim_email_queue(public.email_delivery_mode, integer, uuid) from public, anon, authenticated;
revoke all on function public.prepare_claimed_email(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_email_queue_success(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_email_queue_failure(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.complete_finished_campaigns() from public, anon, authenticated;
grant execute on function public.enqueue_due_campaign_emails(public.email_delivery_mode) to service_role;
grant execute on function public.claim_email_queue(public.email_delivery_mode, integer, uuid) to service_role;
grant execute on function public.prepare_claimed_email(uuid, uuid) to service_role;
grant execute on function public.complete_email_queue_success(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_email_queue_failure(uuid, uuid, boolean, text, text) to service_role;
grant execute on function public.complete_finished_campaigns() to service_role;

comment on table public.email_queue is
  'Database-backed Phase 7 queue. Unique email_draft_id prevents duplicate enqueue; claim tokens and SKIP LOCKED prevent concurrent processing.';
comment on function public.prepare_claimed_email(uuid, uuid) is
  'Service-only final eligibility and suppression check immediately before a Gmail operation.';
comment on function public.add_suppression_entry(text, text) is
  'Admin-only manual suppression. Cancels unsent queue work and never unsends completed mail.';
