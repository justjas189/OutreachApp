alter table public.campaigns
  add column archived_at timestamptz;

update public.campaigns
set archived_at = coalesce(completed_at, created_at)
where status = 'ARCHIVED';

alter table public.campaigns
  add constraint campaigns_archive_consistent check (
    (status = 'ARCHIVED' and archived_at is not null)
    or (status <> 'ARCHIVED' and archived_at is null)
  );

create index campaigns_active_created_at_idx
  on public.campaigns (created_at desc, id)
  where archived_at is null;

create index campaigns_archived_at_idx
  on public.campaigns (archived_at desc, id)
  where archived_at is not null;

create function private.enforce_campaign_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'ARCHIVED' or old.archived_at is not null then
      raise exception 'archived campaigns are read-only' using errcode = '22023';
    end if;

    if (new.status = 'ARCHIVED' or new.archived_at is not null)
      and coalesce(current_setting('app.campaign_lifecycle', true), '') <> 'archive'
    then
      raise exception 'use the campaign lifecycle operation to archive campaigns' using errcode = '22023';
    end if;

    return new;
  end if;

  if old.status = 'ARCHIVED'
    or old.archived_at is not null
    or exists (select 1 from public.send_logs where campaign_id = old.id)
    or exists (
      select 1 from public.recipients
      where campaign_id = old.id and (status = 'SENT' or sent_at is not null)
    )
    or exists (
      select 1 from public.email_drafts
      where campaign_id = old.id and (status = 'SENT' or sent_at is not null)
    )
    or exists (
      select 1 from public.email_queue
      where campaign_id = old.id and status = 'PROCESSING'
    )
  then
    raise exception 'campaign history cannot be permanently deleted' using errcode = '22023';
  end if;

  return old;
end;
$$;

revoke all on function private.enforce_campaign_lifecycle() from public, anon, authenticated;

create trigger campaigns_enforce_lifecycle
before update or delete on public.campaigns
for each row execute function private.enforce_campaign_lifecycle();

create function private.enforce_archived_campaign_read_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_campaign_id := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  if exists (
    select 1 from public.campaigns
    where id = v_campaign_id and (status = 'ARCHIVED' or archived_at is not null)
  ) then
    raise exception 'archived campaign records are read-only' using errcode = '22023';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.enforce_archived_campaign_read_only() from public, anon, authenticated;

create trigger recipients_enforce_archived_read_only
before insert or update or delete on public.recipients
for each row execute function private.enforce_archived_campaign_read_only();

create trigger email_drafts_enforce_archived_read_only
before insert or update or delete on public.email_drafts
for each row execute function private.enforce_archived_campaign_read_only();

create trigger email_queue_enforce_archived_read_only
before insert or update or delete on public.email_queue
for each row execute function private.enforce_archived_campaign_read_only();

create trigger send_logs_enforce_archived_read_only
before insert or update or delete on public.send_logs
for each row execute function private.enforce_archived_campaign_read_only();

create function public.update_campaign_details(
  p_campaign_id uuid,
  p_name text,
  p_city text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_name text := btrim(p_name);
  v_city text := btrim(p_city);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if length(v_name) not between 2 and 120 or length(v_city) not between 2 and 120 then
    raise exception 'campaign name and city must contain 2 to 120 characters' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'ARCHIVED'
    or v_campaign.archived_at is not null
    or v_campaign.started_at is not null
    or exists (select 1 from public.send_logs where campaign_id = p_campaign_id)
  then
    raise exception 'campaign details are locked after sending starts or history exists' using errcode = '22023';
  end if;
  if v_city <> v_campaign.city
    and exists (select 1 from public.email_drafts where campaign_id = p_campaign_id)
  then
    raise exception 'city is locked after email previews are generated' using errcode = '22023';
  end if;

  update public.campaigns
  set name = v_name, city = v_city
  where id = p_campaign_id;
  return true;
end;
$$;

create or replace function public.assign_campaign_senders(
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
  v_campaign public.campaigns%rowtype;
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
    select count(*) from public.sender_accounts
    where id = any(p_sender_ids) and status = 'CONNECTED'
  ) <> v_sender_count then
    raise exception 'only connected senders can be assigned' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'ARCHIVED'
    or v_campaign.archived_at is not null
    or v_campaign.started_at is not null
    or exists (select 1 from public.email_queue where campaign_id = p_campaign_id)
    or exists (select 1 from public.send_logs where campaign_id = p_campaign_id)
    or exists (
      select 1 from public.recipients
      where campaign_id = p_campaign_id and (status in ('QUEUED', 'SENT', 'FAILED') or sent_at is not null)
    )
  then
    raise exception 'sender assignment is locked after queue processing starts' using errcode = '22023';
  end if;

  with ranked_recipients as (
    select id, row_number() over (order by created_at, id) - 1 as position
    from public.recipients
    where campaign_id = p_campaign_id
  ), balanced as (
    select id, p_sender_ids[(position % v_sender_count) + 1] as sender_account_id
    from ranked_recipients
  ), updated as (
    update public.recipients as recipient
    set assigned_sender_id = balanced.sender_account_id
    from balanced
    where recipient.id = balanced.id
    returning recipient.id
  )
  select count(*) into v_recipient_count from updated;

  update public.email_drafts as draft
  set sender_account_id = recipient.assigned_sender_id
  from public.recipients as recipient
  where draft.recipient_id = recipient.id
    and draft.campaign_id = p_campaign_id
    and draft.status in ('GENERATED', 'APPROVED');

  return v_recipient_count;
end;
$$;

create or replace function public.schedule_campaign(
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
    or not exists (
      select 1 from pg_catalog.pg_timezone_names
      where name = btrim(p_schedule_timezone)
    )
  then
    raise exception 'campaign schedule is invalid' using errcode = '22023';
  end if;

  perform 1 from public.campaigns
  where id = p_campaign_id and status <> 'ARCHIVED' and archived_at is null
  for update;
  if not found then
    raise exception 'active campaign not found' using errcode = 'P0002';
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

create function public.manage_campaign_lifecycle(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_must_archive boolean;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'ARCHIVED' or v_campaign.archived_at is not null then
    return 'ARCHIVED';
  end if;

  v_must_archive :=
    exists (select 1 from public.send_logs where campaign_id = p_campaign_id)
    or exists (
      select 1 from public.recipients
      where campaign_id = p_campaign_id and (status = 'SENT' or sent_at is not null)
    )
    or exists (
      select 1 from public.email_drafts
      where campaign_id = p_campaign_id and (status = 'SENT' or sent_at is not null)
    )
    or exists (
      select 1 from public.email_queue
      where campaign_id = p_campaign_id and status = 'PROCESSING'
    );

  if not v_must_archive then
    update public.email_queue
    set status = 'CANCELLED', completed_at = now(), claim_token = null, claimed_at = null,
        last_error_code = 'campaign_deleted', last_error_message = 'Campaign was permanently deleted.'
    where campaign_id = p_campaign_id and status in ('PENDING', 'RETRY');

    delete from public.campaigns where id = p_campaign_id;
    return 'DELETED';
  end if;

  with cancelled as (
    update public.email_queue
    set status = 'CANCELLED', completed_at = now(), claim_token = null, claimed_at = null,
        last_error_code = 'campaign_archived', last_error_message = 'Campaign was archived.'
    where campaign_id = p_campaign_id and status in ('PENDING', 'RETRY')
    returning recipient_id, email_draft_id
  ), restored_drafts as (
    update public.email_drafts as draft
    set status = 'APPROVED'
    from cancelled
    where draft.id = cancelled.email_draft_id and draft.status = 'QUEUED'
    returning cancelled.recipient_id
  )
  update public.recipients as recipient
  set status = 'APPROVED', last_error = null
  from restored_drafts
  where recipient.id = restored_drafts.recipient_id and recipient.status = 'QUEUED';

  perform set_config('app.campaign_lifecycle', 'archive', true);
  update public.campaigns
  set status = 'ARCHIVED', archived_at = now(),
      scheduled_at = null, schedule_timezone = null, paused_at = null
  where id = p_campaign_id;

  return 'ARCHIVED';
end;
$$;

create or replace function public.enqueue_due_campaign_emails(p_delivery_mode public.email_delivery_mode)
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
  where status = 'READY' and archived_at is null and scheduled_at <= now();

  update public.recipients as recipient
  set status = 'SUPPRESSED', sent_at = null, last_error = null
  from public.campaigns as campaign
  where campaign.id = recipient.campaign_id
    and campaign.archived_at is null
    and campaign.status in ('READY', 'ACTIVE', 'PAUSED')
    and recipient.status <> 'SENT'
    and exists (select 1 from public.suppression_list as suppression where suppression.email = recipient.email);
  update public.email_drafts as draft
  set status = 'SUPPRESSED'
  from public.recipients as recipient, public.campaigns as campaign
  where recipient.id = draft.recipient_id
    and campaign.id = draft.campaign_id
    and campaign.archived_at is null
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
      and campaign.archived_at is null
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

create or replace function public.prepare_claimed_email(p_queue_id uuid, p_claim_token uuid)
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

  if v_campaign.id is null or v_campaign.status = 'ARCHIVED' or v_campaign.archived_at is not null then
    update public.email_queue
    set status = 'CANCELLED', completed_at = now(), claim_token = null, claimed_at = null,
        last_error_code = 'campaign_inactive', last_error_message = 'Campaign is deleted or archived.'
    where id = v_queue.id;
    update public.email_drafts set status = 'APPROVED'
    where id = v_draft.id and status = 'QUEUED';
    update public.recipients set status = 'APPROVED', last_error = null
    where id = v_recipient.id and status = 'QUEUED';
    return;
  end if;

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

  if v_campaign.status <> 'ACTIVE' or v_campaign.paused_at is not null or v_campaign.scheduled_at is null
    or v_campaign.scheduled_at > now() or v_sender.status <> 'CONNECTED'
    or v_recipient.status <> 'QUEUED' or v_draft.status <> 'QUEUED'
    or v_recipient.sent_at is not null
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

revoke all on function public.update_campaign_details(uuid, text, text) from public, anon;
revoke all on function public.manage_campaign_lifecycle(uuid) from public, anon, authenticated;
grant execute on function public.update_campaign_details(uuid, text, text) to authenticated;
grant execute on function public.manage_campaign_lifecycle(uuid) to authenticated;

comment on column public.campaigns.archived_at is
  'Permanent archive marker. Archived campaigns are read-only and excluded from all queue eligibility.';
comment on function public.manage_campaign_lifecycle(uuid) is
  'Admin-only atomic delete/archive decision. History or an active queue claim forces archive; otherwise owned records cascade-delete safely.';
