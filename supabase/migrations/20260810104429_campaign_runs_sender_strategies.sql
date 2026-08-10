alter type public.campaign_status add value if not exists 'FAILED' after 'COMPLETED';

create type public.campaign_run_status as enum (
  'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'
);
create type public.sender_strategy as enum ('single', 'balanced');
create type public.campaign_run_scope as enum ('all', 'failed');
create type public.campaign_run_recipient_status as enum (
  'PENDING', 'PROCESSING', 'PREVIEWED', 'DRAFTED', 'SENT', 'FAILED', 'SUPPRESSED', 'CANCELLED'
);

create table public.campaign_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  run_number integer not null,
  status public.campaign_run_status not null,
  delivery_mode public.runtime_email_mode not null,
  sender_strategy public.sender_strategy not null,
  selected_sender_ids uuid[] not null,
  batch_size integer not null,
  run_scope public.campaign_run_scope not null default 'all',
  retry_of_run_id uuid references public.campaign_runs(id) on delete restrict,
  scheduled_at timestamptz not null,
  schedule_timezone text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint campaign_runs_number_positive check (run_number > 0),
  constraint campaign_runs_batch_valid check (batch_size between 1 and 50),
  constraint campaign_runs_senders_present check (cardinality(selected_sender_ids) > 0),
  constraint campaign_runs_timezone_present check (length(btrim(schedule_timezone)) between 1 and 100),
  constraint campaign_runs_status_times check (
    (status in ('COMPLETED', 'FAILED', 'CANCELLED') and completed_at is not null)
    or (status not in ('COMPLETED', 'FAILED', 'CANCELLED') and completed_at is null)
  ),
  unique (campaign_id, run_number)
);

create unique index campaign_runs_one_active_idx
  on public.campaign_runs (campaign_id)
  where status in ('SCHEDULED', 'ACTIVE', 'PAUSED');
create index campaign_runs_campaign_created_idx
  on public.campaign_runs (campaign_id, run_number desc);
create index campaign_runs_due_idx
  on public.campaign_runs (scheduled_at, id)
  where status = 'SCHEDULED';

create table public.campaign_run_recipients (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_run_id uuid not null references public.campaign_runs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete restrict,
  email_draft_id uuid not null references public.email_drafts(id) on delete restrict,
  sender_account_id uuid not null references public.sender_accounts(id) on delete restrict,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status public.campaign_run_recipient_status not null default 'PENDING',
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaign_run_recipients_email_normalized check (recipient_email = lower(btrim(recipient_email))),
  constraint campaign_run_recipients_content_valid check (
    length(btrim(subject)) between 1 and 200 and subject !~ E'[\r\n]' and length(body) between 1 and 50000
  ),
  unique (campaign_run_id, recipient_id)
);
create index campaign_run_recipients_run_status_idx
  on public.campaign_run_recipients (campaign_run_id, status);
create index campaign_run_recipients_recipient_idx
  on public.campaign_run_recipients (recipient_id, created_at desc);

alter table public.email_queue
  add column campaign_run_id uuid references public.campaign_runs(id) on delete cascade,
  add column campaign_run_recipient_id uuid references public.campaign_run_recipients(id) on delete cascade;
alter table public.send_logs
  add column campaign_run_id uuid references public.campaign_runs(id) on delete set null,
  add column email_queue_id uuid references public.email_queue(id) on delete set null;

do $$
declare
  v_campaign record;
  v_run_id uuid;
begin
  for v_campaign in
    select campaign.id, campaign.created_by, campaign.status, campaign.scheduled_at,
      campaign.schedule_timezone, campaign.started_at, campaign.completed_at,
      (array_agg(queue.delivery_mode order by queue.created_at))[1] as delivery_mode,
      array_agg(distinct queue.sender_account_id) as sender_ids
    from public.campaigns as campaign
    join public.email_queue as queue on queue.campaign_id = campaign.id
    group by campaign.id
  loop
    insert into public.campaign_runs (
      campaign_id, run_number, status, delivery_mode, sender_strategy, selected_sender_ids,
      batch_size, run_scope, scheduled_at, schedule_timezone, started_at, completed_at, created_by, created_at
    ) values (
      v_campaign.id, 1,
      case
        when v_campaign.status = 'PAUSED' then 'PAUSED'::public.campaign_run_status
        when v_campaign.status = 'COMPLETED' then 'COMPLETED'::public.campaign_run_status
        when v_campaign.status = 'ARCHIVED' then 'CANCELLED'::public.campaign_run_status
        when v_campaign.status = 'ACTIVE' then 'ACTIVE'::public.campaign_run_status
        else 'SCHEDULED'::public.campaign_run_status
      end,
      v_campaign.delivery_mode::text::public.runtime_email_mode,
      case when cardinality(v_campaign.sender_ids) = 1 then 'single'::public.sender_strategy else 'balanced'::public.sender_strategy end,
      v_campaign.sender_ids, 5, 'all', coalesce(v_campaign.scheduled_at, v_campaign.started_at, now()),
      coalesce(v_campaign.schedule_timezone, 'UTC'), v_campaign.started_at,
      case when v_campaign.status in ('COMPLETED', 'ARCHIVED') then coalesce(v_campaign.completed_at, now()) else null end,
      v_campaign.created_by, coalesce(v_campaign.started_at, now())
    ) returning id into v_run_id;

    insert into public.campaign_run_recipients (
      campaign_run_id, campaign_id, recipient_id, email_draft_id, sender_account_id,
      recipient_email, subject, body, status, last_error_code, last_error_message, completed_at, created_at
    )
    select v_run_id, queue.campaign_id, queue.recipient_id, queue.email_draft_id, queue.sender_account_id,
      recipient.email, draft.subject, draft.body,
      case
        when queue.status = 'COMPLETED' and queue.delivery_mode = 'live' then 'SENT'::public.campaign_run_recipient_status
        when queue.status = 'COMPLETED' then 'DRAFTED'::public.campaign_run_recipient_status
        when queue.status = 'FAILED' then 'FAILED'::public.campaign_run_recipient_status
        when queue.status = 'CANCELLED' then 'CANCELLED'::public.campaign_run_recipient_status
        when queue.status = 'PROCESSING' then 'PROCESSING'::public.campaign_run_recipient_status
        else 'PENDING'::public.campaign_run_recipient_status
      end,
      queue.last_error_code, queue.last_error_message, queue.completed_at, queue.created_at
    from public.email_queue as queue
    join public.recipients as recipient on recipient.id = queue.recipient_id
    join public.email_drafts as draft on draft.id = queue.email_draft_id
    where queue.campaign_id = v_campaign.id;

    update public.email_queue as queue
    set campaign_run_id = run_recipient.campaign_run_id,
        campaign_run_recipient_id = run_recipient.id
    from public.campaign_run_recipients as run_recipient
    where queue.campaign_id = v_campaign.id
      and run_recipient.campaign_run_id = v_run_id
      and run_recipient.email_draft_id = queue.email_draft_id;
  end loop;
end;
$$;

alter table public.email_queue
  alter column campaign_run_id set not null,
  alter column campaign_run_recipient_id set not null,
  drop constraint email_queue_email_draft_id_key,
  add constraint email_queue_run_recipient_unique unique (campaign_run_id, campaign_run_recipient_id);
create index email_queue_run_status_idx on public.email_queue (campaign_run_id, status);
create index send_logs_run_created_idx on public.send_logs (campaign_run_id, created_at desc);

update public.send_logs as log
set campaign_run_id = queue.campaign_run_id,
    email_queue_id = queue.id
from (
  select distinct on (item.campaign_id, item.recipient_id, item.sender_account_id)
    item.id, item.campaign_run_id, item.campaign_id, item.recipient_id, item.sender_account_id
  from public.email_queue as item
  order by item.campaign_id, item.recipient_id, item.sender_account_id, item.created_at desc
) as queue
where log.campaign_run_id is null
  and queue.campaign_id = log.campaign_id
  and queue.recipient_id = log.recipient_id
  and queue.sender_account_id = log.sender_account_id;

alter table public.campaign_runs enable row level security;
alter table public.campaign_run_recipients enable row level security;
revoke all on public.campaign_runs, public.campaign_run_recipients from anon;
grant select on public.campaign_runs, public.campaign_run_recipients to authenticated;
grant select, insert, update, delete on public.campaign_runs, public.campaign_run_recipients to service_role;
create policy "admins view campaign runs" on public.campaign_runs for select to authenticated
  using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');
create policy "admins view campaign run recipients" on public.campaign_run_recipients for select to authenticated
  using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create function public.get_campaign_run_readiness(
  p_campaign_id uuid,
  p_recipient_guard_mode text default 'allowlist'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_all_count integer;
  v_failed_count integer;
  v_suppressed_count integer;
  v_blocked jsonb;
  v_active boolean;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null then raise exception 'campaign not found' using errcode = 'P0002'; end if;

  select exists(
    select 1 from public.campaign_runs where campaign_id = p_campaign_id and status in ('SCHEDULED','ACTIVE','PAUSED')
  ) into v_active;
  select count(*) into v_suppressed_count from public.recipients as recipient
    where recipient.campaign_id = p_campaign_id
      and (recipient.status = 'SUPPRESSED' or exists(select 1 from public.suppression_list s where s.email = recipient.email));
  select count(*) into v_all_count
    from public.email_drafts draft join public.recipients recipient on recipient.id = draft.recipient_id
    where draft.campaign_id = p_campaign_id and draft.approved_at is not null
      and recipient.status <> 'SUPPRESSED'
      and not exists(select 1 from public.suppression_list s where s.email = recipient.email);
  select count(*) into v_failed_count
    from public.email_drafts draft join public.recipients recipient on recipient.id = draft.recipient_id
    where draft.campaign_id = p_campaign_id and draft.approved_at is not null
      and exists (
        select 1 from public.campaign_run_recipients rr
        join public.campaign_runs rr_run on rr_run.id = rr.campaign_run_id
        where rr.recipient_id = recipient.id and rr.status = 'FAILED'
          and not exists (
            select 1 from public.campaign_run_recipients newer
            join public.campaign_runs newer_run on newer_run.id = newer.campaign_run_id
            where newer.recipient_id = rr.recipient_id and newer_run.run_number > rr_run.run_number
          )
          and coalesce(rr.last_error_code, '') <> 'invalid_recipient'
          and not (coalesce(rr.last_error_code, '') = 'recipient_not_allowlisted' and p_recipient_guard_mode = 'allowlist')
      )
      and recipient.status <> 'SUPPRESSED'
      and not exists(select 1 from public.suppression_list s where s.email = recipient.email);
  select coalesce(jsonb_agg(jsonb_build_object(
      'email', recipient.email,
      'reason', case
        when recipient.status = 'SUPPRESSED' or exists(select 1 from public.suppression_list s where s.email = recipient.email) then 'Recipient is suppressed'
        when rr.last_error_code = 'recipient_not_allowlisted' and p_recipient_guard_mode = 'allowlist' then 'Recipient is not allowlisted'
        when rr.last_error_code = 'invalid_recipient' then 'Recipient address is invalid'
        else coalesce(rr.last_error_message, 'Failure must be corrected before retry')
      end
    ) order by recipient.email), '[]'::jsonb)
  into v_blocked
  from public.recipients recipient
  join lateral (
    select item.last_error_code, item.last_error_message
    from public.campaign_run_recipients item
    join public.campaign_runs item_run on item_run.id = item.campaign_run_id
    where item.recipient_id = recipient.id and item.status = 'FAILED'
    order by item_run.run_number desc limit 1
  ) rr on true
  where recipient.campaign_id = p_campaign_id
    and (
      recipient.status = 'SUPPRESSED'
      or exists(select 1 from public.suppression_list s where s.email = recipient.email)
      or rr.last_error_code = 'invalid_recipient'
      or (rr.last_error_code = 'recipient_not_allowlisted' and p_recipient_guard_mode = 'allowlist')
    );

  return jsonb_build_object(
    'campaignStatus', v_campaign.status,
    'activeRun', v_active,
    'allEligibleCount', case when v_campaign.archived_at is null then v_all_count else 0 end,
    'failedEligibleCount', case when v_campaign.archived_at is null then v_failed_count else 0 end,
    'suppressedCount', v_suppressed_count,
    'blocked', v_blocked,
    'canRunAll', v_campaign.archived_at is null and not v_active and v_all_count > 0,
    'canRetryFailed', v_campaign.archived_at is null and not v_active and v_failed_count > 0
  );
end;
$$;

create or replace function public.assign_campaign_senders(p_campaign_id uuid,p_sender_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_sender_count integer; v_recipient_count integer;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  v_sender_count:=cardinality(p_sender_ids);
  if v_sender_count is null or v_sender_count=0
    or exists(select 1 from unnest(p_sender_ids) sender_id where sender_id is null)
    or (select count(distinct sender_id) from unnest(p_sender_ids) sender_id)<>v_sender_count
  then raise exception 'sender selection contains invalid entries' using errcode='22023'; end if;
  if (
    select count(*) from public.sender_accounts sender
    join private.sender_credentials credentials on credentials.sender_account_id=sender.id
    where sender.id=any(p_sender_ids) and sender.status='CONNECTED'
  )<>v_sender_count then raise exception 'only connected senders with credentials can be assigned' using errcode='22023'; end if;
  perform 1 from public.campaigns where id=p_campaign_id and archived_at is null for update;
  if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
  if exists(select 1 from public.email_queue where campaign_id=p_campaign_id)
    or exists(select 1 from public.send_logs where campaign_id=p_campaign_id)
    or exists(select 1 from public.campaign_runs where campaign_id=p_campaign_id)
  then raise exception 'sender assignment is locked after run history starts' using errcode='22023'; end if;
  with ranked as (
    select id,row_number() over(order by created_at,id)-1 position from public.recipients where campaign_id=p_campaign_id
  ), assigned as (
    update public.recipients recipient set assigned_sender_id=p_sender_ids[(ranked.position%v_sender_count)+1]
    from ranked where recipient.id=ranked.id returning recipient.id,recipient.assigned_sender_id
  )
  update public.email_drafts draft set sender_account_id=assigned.assigned_sender_id
  from assigned where draft.recipient_id=assigned.id and draft.status='GENERATED';
  select count(*) into v_recipient_count from public.recipients where campaign_id=p_campaign_id;
  return v_recipient_count;
end; $$;

create function public.create_campaign_run(
  p_campaign_id uuid,
  p_delivery_mode public.runtime_email_mode,
  p_batch_size integer,
  p_sender_strategy public.sender_strategy,
  p_sender_ids uuid[],
  p_run_scope public.campaign_run_scope,
  p_scheduled_at timestamptz,
  p_schedule_timezone text,
  p_recipient_guard_mode text default 'allowlist'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_run_id uuid;
  v_run_number integer;
  v_sender_count integer;
  v_recipient_count integer;
  v_retry_of uuid;
  v_status public.campaign_run_status;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_batch_size not between 1 and 50 or p_scheduled_at is null
    or p_scheduled_at < now() - interval '5 minutes'
    or length(btrim(p_schedule_timezone)) not between 1 and 100
    or p_recipient_guard_mode not in ('allowlist','production')
  then raise exception 'campaign run configuration is invalid' using errcode = '22023'; end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found' using errcode = 'P0002'; end if;
  if v_campaign.status = 'ARCHIVED' or v_campaign.archived_at is not null then
    raise exception 'archived campaign is read only' using errcode = '22023';
  end if;
  if exists(select 1 from public.campaign_runs where campaign_id = p_campaign_id and status in ('SCHEDULED','ACTIVE','PAUSED')) then
    raise exception 'campaign already has an active run' using errcode = '23505';
  end if;

  v_sender_count := cardinality(p_sender_ids);
  if v_sender_count is null or v_sender_count = 0
    or exists(select 1 from unnest(p_sender_ids) sender_id where sender_id is null)
    or (select count(distinct sender_id) from unnest(p_sender_ids) sender_id) <> v_sender_count
    or (p_sender_strategy = 'single' and v_sender_count <> 1)
    or (p_sender_strategy = 'balanced' and v_sender_count < 2)
  then raise exception 'sender strategy selection is invalid' using errcode = '22023'; end if;
  if (
    select count(*) from public.sender_accounts sender
    join private.sender_credentials credentials on credentials.sender_account_id = sender.id
    where sender.id = any(p_sender_ids) and sender.status = 'CONNECTED'
  ) <> v_sender_count then
    raise exception 'only connected senders with credentials may be selected' using errcode = '22023';
  end if;

  if p_run_scope = 'failed' then
    select run.id into v_retry_of from public.campaign_runs run
    where run.campaign_id = p_campaign_id and run.status = 'FAILED'
    order by run.run_number desc limit 1;
    if v_retry_of is null then raise exception 'no failed run is available for retry' using errcode = '22023'; end if;
  end if;
  select coalesce(max(run_number),0)+1 into v_run_number from public.campaign_runs where campaign_id = p_campaign_id;
  v_status := case
    when p_delivery_mode = 'preview' then 'COMPLETED'::public.campaign_run_status
    when p_scheduled_at <= now() then 'ACTIVE'::public.campaign_run_status
    else 'SCHEDULED'::public.campaign_run_status
  end;
  insert into public.campaign_runs (
    campaign_id, run_number, status, delivery_mode, sender_strategy, selected_sender_ids,
    batch_size, run_scope, retry_of_run_id, scheduled_at, schedule_timezone, started_at, completed_at, created_by
  ) values (
    p_campaign_id, v_run_number, v_status, p_delivery_mode, p_sender_strategy, p_sender_ids,
    p_batch_size, p_run_scope, v_retry_of, p_scheduled_at, btrim(p_schedule_timezone),
    case when v_status in ('ACTIVE','COMPLETED') then now() else null end,
    case when v_status = 'COMPLETED' then now() else null end, auth.uid()
  ) returning id into v_run_id;

  with candidates as (
    select recipient.id as recipient_id, draft.id as draft_id, recipient.email, draft.subject, draft.body,
      row_number() over(order by recipient.created_at, recipient.id) - 1 as position
    from public.recipients recipient
    join public.email_drafts draft on draft.recipient_id = recipient.id and draft.campaign_id = p_campaign_id
    where recipient.campaign_id = p_campaign_id and draft.approved_at is not null
      and recipient.status <> 'SUPPRESSED'
      and not exists(select 1 from public.suppression_list s where s.email = recipient.email)
      and (
        p_run_scope = 'all'
        or exists(
          select 1 from public.campaign_run_recipients previous
          join public.campaign_runs previous_run on previous_run.id = previous.campaign_run_id
          where previous.recipient_id = recipient.id and previous.status = 'FAILED'
            and not exists (
              select 1 from public.campaign_run_recipients newer
              join public.campaign_runs newer_run on newer_run.id = newer.campaign_run_id
              where newer.recipient_id = previous.recipient_id and newer_run.run_number > previous_run.run_number
            )
            and coalesce(previous.last_error_code,'') <> 'invalid_recipient'
            and not (coalesce(previous.last_error_code,'') = 'recipient_not_allowlisted' and p_recipient_guard_mode = 'allowlist')
        )
      )
  )
  insert into public.campaign_run_recipients (
    campaign_run_id, campaign_id, recipient_id, email_draft_id, sender_account_id,
    recipient_email, subject, body, status, completed_at
  )
  select v_run_id, p_campaign_id, candidate.recipient_id, candidate.draft_id,
    p_sender_ids[(candidate.position % v_sender_count)+1], candidate.email, candidate.subject, candidate.body,
    case when p_delivery_mode = 'preview' then 'PREVIEWED'::public.campaign_run_recipient_status else 'PENDING'::public.campaign_run_recipient_status end,
    case when p_delivery_mode = 'preview' then now() else null end
  from candidates candidate;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then raise exception 'no eligible approved recipients for this run' using errcode = '22023'; end if;

  if p_delivery_mode in ('draft','live') then
    insert into public.email_queue (
      email_draft_id, campaign_id, recipient_id, sender_account_id, delivery_mode,
      available_at, campaign_run_id, campaign_run_recipient_id
    )
    select rr.email_draft_id, rr.campaign_id, rr.recipient_id, rr.sender_account_id,
      p_delivery_mode::text::public.email_delivery_mode, p_scheduled_at, v_run_id, rr.id
    from public.campaign_run_recipients rr where rr.campaign_run_id = v_run_id;
  end if;

  update public.campaigns set
    status = case
      when v_status = 'ACTIVE' then 'ACTIVE'::public.campaign_status
      when v_status = 'SCHEDULED' then 'READY'::public.campaign_status
      else 'COMPLETED'::public.campaign_status
    end,
    scheduled_at = p_scheduled_at, schedule_timezone = btrim(p_schedule_timezone), paused_at = null,
    started_at = case when v_status in ('ACTIVE','COMPLETED') then now() else null end,
    completed_at = case when v_status = 'COMPLETED' then now() else null end
  where id = p_campaign_id;
  return v_run_id;
end;
$$;

create or replace function public.enqueue_due_campaign_emails(p_delivery_mode public.email_delivery_mode)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with activated as (
    update public.campaign_runs run set status='ACTIVE', started_at=coalesce(started_at,now())
    where run.status='SCHEDULED' and run.scheduled_at<=now() and run.delivery_mode::text=p_delivery_mode::text
      and exists(select 1 from public.campaigns c where c.id=run.campaign_id and c.archived_at is null)
    returning run.campaign_id
  )
  update public.campaigns c set status='ACTIVE', started_at=coalesce(c.started_at,now())
  from activated where c.id=activated.campaign_id;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.claim_email_queue(p_delivery_mode public.email_delivery_mode, p_batch_size integer, p_claim_token uuid)
returns table(queue_id uuid, delivery_mode public.email_delivery_mode)
language plpgsql security definer set search_path = '' as $$
declare v_expired_count integer;
begin
  if p_batch_size not between 1 and 50 or p_claim_token is null then raise exception 'queue claim parameters are invalid' using errcode='22023'; end if;
  with expired as (
    update public.email_queue q set
      status=case when attempts>=max_attempts then 'FAILED'::public.email_queue_status else 'RETRY'::public.email_queue_status end,
      available_at=now(), completed_at=case when attempts>=max_attempts then now() else null end,
      claim_token=null, claimed_at=null, last_error_code='stale_claim', last_error_message='A previous worker claim expired.'
    where status='PROCESSING' and claimed_at<now()-interval '15 minutes'
    returning q.*
  ), updated_rr as (
    update public.campaign_run_recipients rr set
      status=case when expired.status='FAILED' then 'FAILED'::public.campaign_run_recipient_status else 'PENDING'::public.campaign_run_recipient_status end,
      last_error_code=expired.last_error_code, last_error_message=expired.last_error_message,
      completed_at=case when expired.status='FAILED' then now() else null end
    from expired where rr.id=expired.campaign_run_recipient_id returning rr.id
  ) select count(*) into v_expired_count from updated_rr;
  raise debug 'Recovered % expired email queue claims.', v_expired_count;

  return query with candidates as (
    select candidate.id from public.sender_accounts sender cross join lateral (
      select q.id from public.email_queue q
      join public.campaign_runs run on run.id=q.campaign_run_id
      join public.campaigns c on c.id=q.campaign_id
      join public.campaign_run_recipients rr on rr.id=q.campaign_run_recipient_id
      where q.sender_account_id=sender.id and q.delivery_mode=p_delivery_mode
        and q.status in ('PENDING','RETRY') and q.available_at<=now() and q.attempts<q.max_attempts
        and run.status='ACTIVE' and run.scheduled_at<=now() and c.archived_at is null
        and rr.status='PENDING'
      order by q.available_at,q.created_at,q.id for update of q skip locked limit p_batch_size
    ) candidate where sender.status='CONNECTED'
  ), claimed as (
    update public.email_queue q set status='PROCESSING',attempts=attempts+1,claim_token=p_claim_token,claimed_at=now(),last_error_code=null,last_error_message=null
    from candidates where q.id=candidates.id returning q.id,q.delivery_mode,q.campaign_run_recipient_id
  ), marked as (
    update public.campaign_run_recipients rr set status='PROCESSING' from claimed where rr.id=claimed.campaign_run_recipient_id
  ) select claimed.id,claimed.delivery_mode from claimed;
end; $$;

create or replace function public.prepare_claimed_email(p_queue_id uuid,p_claim_token uuid)
returns table(queue_id uuid,delivery_mode public.email_delivery_mode,recipient_email text,sender_email text,subject text,body text,encrypted_refresh_token text)
language plpgsql security definer set search_path='' as $$
declare v_queue public.email_queue%rowtype; v_rr public.campaign_run_recipients%rowtype; v_run public.campaign_runs%rowtype; v_campaign public.campaigns%rowtype; v_sender public.sender_accounts%rowtype; v_token text;
begin
  select * into v_queue from public.email_queue where id=p_queue_id and status='PROCESSING' and claim_token=p_claim_token for update;
  if v_queue.id is null then return; end if;
  select * into v_rr from public.campaign_run_recipients where id=v_queue.campaign_run_recipient_id;
  select * into v_run from public.campaign_runs where id=v_queue.campaign_run_id;
  select * into v_campaign from public.campaigns where id=v_queue.campaign_id;
  select * into v_sender from public.sender_accounts where id=v_queue.sender_account_id;
  if v_campaign.id is null or v_campaign.archived_at is not null or v_run.status<>'ACTIVE' then
    update public.email_queue set status='CANCELLED',completed_at=now(),claim_token=null,claimed_at=null,last_error_code='campaign_inactive',last_error_message='Campaign run is inactive.' where id=v_queue.id;
    update public.campaign_run_recipients set status='CANCELLED',completed_at=now(),last_error_code='campaign_inactive',last_error_message='Campaign run is inactive.' where id=v_rr.id;
    return;
  end if;
  if exists(select 1 from public.suppression_list where email=v_rr.recipient_email) then
    update public.email_queue set status='CANCELLED',completed_at=now(),claim_token=null,claimed_at=null,last_error_code='suppressed',last_error_message='Recipient is suppressed.' where id=v_queue.id;
    update public.campaign_run_recipients set status='SUPPRESSED',completed_at=now(),last_error_code='suppressed',last_error_message='Recipient is suppressed.' where id=v_rr.id;
    update public.recipients set status='SUPPRESSED',sent_at=null,last_error=null where id=v_rr.recipient_id and status<>'SENT';
    insert into public.send_logs(campaign_id,recipient_id,sender_account_id,status,error_message,campaign_run_id,email_queue_id) values(v_queue.campaign_id,v_queue.recipient_id,v_queue.sender_account_id,'SUPPRESSED','Recipient is suppressed.',v_queue.campaign_run_id,v_queue.id);
    return;
  end if;
  select credentials.encrypted_refresh_token into v_token from private.sender_credentials credentials where credentials.sender_account_id=v_sender.id;
  if v_sender.status<>'CONNECTED' or v_token is null then
    update public.email_queue set status='FAILED',completed_at=now(),claim_token=null,claimed_at=null,last_error_code='sender_credentials_missing',last_error_message='Sender connection or credentials are unavailable.' where id=v_queue.id;
    update public.campaign_run_recipients set status='FAILED',completed_at=now(),last_error_code='sender_credentials_missing',last_error_message='Sender connection or credentials are unavailable.' where id=v_rr.id;
    insert into public.send_logs(campaign_id,recipient_id,sender_account_id,status,error_message,campaign_run_id,email_queue_id) values(v_queue.campaign_id,v_queue.recipient_id,v_queue.sender_account_id,'FAILED','Sender connection or credentials are unavailable.',v_queue.campaign_run_id,v_queue.id);
    return;
  end if;
  return query select v_queue.id,v_queue.delivery_mode,v_rr.recipient_email,v_sender.email,v_rr.subject,v_rr.body,v_token;
end; $$;

create or replace function public.complete_email_queue_success(p_queue_id uuid,p_claim_token uuid,p_provider_message_id text,p_gmail_draft_id text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_queue public.email_queue%rowtype;
begin
  select * into v_queue from public.email_queue where id=p_queue_id and status='PROCESSING' and claim_token=p_claim_token for update;
  if v_queue.id is null then return false; end if;
  update public.email_queue set status='COMPLETED',completed_at=now(),claim_token=null,claimed_at=null where id=v_queue.id;
  update public.campaign_run_recipients set status=case when v_queue.delivery_mode='draft' then 'DRAFTED'::public.campaign_run_recipient_status else 'SENT'::public.campaign_run_recipient_status end,completed_at=now(),last_error_code=null,last_error_message=null where id=v_queue.campaign_run_recipient_id;
  if v_queue.delivery_mode='draft' then
    update public.email_drafts set gmail_draft_id=p_gmail_draft_id where id=v_queue.email_draft_id;
  end if;
  if v_queue.delivery_mode='live' then update public.recipients set status='SENT',sent_at=now(),last_error=null where id=v_queue.recipient_id; end if;
  insert into public.send_logs(campaign_id,recipient_id,sender_account_id,status,provider_message_id,campaign_run_id,email_queue_id)
  values(v_queue.campaign_id,v_queue.recipient_id,v_queue.sender_account_id,case when v_queue.delivery_mode='draft' then 'DRAFTED'::public.send_log_status else 'SENT'::public.send_log_status end,p_provider_message_id,v_queue.campaign_run_id,v_queue.id);
  return true;
end; $$;

create or replace function public.complete_email_queue_failure(p_queue_id uuid,p_claim_token uuid,p_transient boolean,p_error_code text,p_error_message text)
returns public.email_queue_status language plpgsql security definer set search_path='' as $$
declare v_queue public.email_queue%rowtype; v_status public.email_queue_status;
begin
  select * into v_queue from public.email_queue where id=p_queue_id and status='PROCESSING' and claim_token=p_claim_token for update;
  if v_queue.id is null then raise exception 'active queue claim not found' using errcode='P0002'; end if;
  if length(p_error_code) not between 1 and 80 or length(p_error_message) not between 1 and 500 then raise exception 'safe queue error is invalid' using errcode='22023'; end if;
  v_status:=case when p_transient and v_queue.attempts<v_queue.max_attempts then 'RETRY'::public.email_queue_status else 'FAILED'::public.email_queue_status end;
  update public.email_queue set status=v_status,available_at=case when v_status='RETRY' then now()+make_interval(secs=>least(3600,30*power(2,greatest(attempts-1,0))::integer)) else available_at end,completed_at=case when v_status='FAILED' then now() else null end,claim_token=null,claimed_at=null,last_error_code=p_error_code,last_error_message=p_error_message where id=v_queue.id;
  update public.campaign_run_recipients set status=case when v_status='FAILED' then 'FAILED'::public.campaign_run_recipient_status else 'PENDING'::public.campaign_run_recipient_status end,last_error_code=p_error_code,last_error_message=p_error_message,completed_at=case when v_status='FAILED' then now() else null end where id=v_queue.campaign_run_recipient_id;
  update public.recipients set status='FAILED',last_error=p_error_message where id=v_queue.recipient_id and status<>'SENT' and v_status='FAILED';
  insert into public.send_logs(campaign_id,recipient_id,sender_account_id,status,error_message,campaign_run_id,email_queue_id) values(v_queue.campaign_id,v_queue.recipient_id,v_queue.sender_account_id,case when v_status='RETRY' then 'RETRY'::public.send_log_status else 'FAILED'::public.send_log_status end,p_error_message,v_queue.campaign_run_id,v_queue.id);
  return v_status;
end; $$;

create or replace function public.complete_finished_campaigns()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with finished as (
    update public.campaign_runs run set status=case when exists(select 1 from public.campaign_run_recipients rr where rr.campaign_run_id=run.id and rr.status='FAILED') then 'FAILED'::public.campaign_run_status else 'COMPLETED'::public.campaign_run_status end,completed_at=now()
    where run.status='ACTIVE' and exists(select 1 from public.email_queue q where q.campaign_run_id=run.id)
      and not exists(select 1 from public.email_queue q where q.campaign_run_id=run.id and q.status in ('PENDING','PROCESSING','RETRY'))
    returning run.campaign_id,run.status
  ), updated as (
    update public.campaigns campaign set status=case when finished.status='FAILED' then 'FAILED'::public.campaign_status else 'COMPLETED'::public.campaign_status end,completed_at=now()
    from finished where campaign.id=finished.campaign_id and campaign.archived_at is null returning campaign.id
  ) select count(*) into v_count from updated;
  return v_count;
end; $$;

create or replace function public.pause_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  update public.campaign_runs set status='PAUSED' where campaign_id=p_campaign_id and status in ('ACTIVE','SCHEDULED');
  if not found then return false; end if;
  update public.campaigns set status='PAUSED',paused_at=now() where id=p_campaign_id and archived_at is null;
  return true;
end; $$;

create or replace function public.resume_campaign(p_campaign_id uuid)
returns public.campaign_status language plpgsql security definer set search_path='' as $$
declare v_status public.campaign_status;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  update public.campaign_runs set status=case when scheduled_at<=now() then 'ACTIVE'::public.campaign_run_status else 'SCHEDULED'::public.campaign_run_status end where campaign_id=p_campaign_id and status='PAUSED';
  if not found then raise exception 'paused campaign run not found' using errcode='P0002'; end if;
  select case when run.status='ACTIVE' then 'ACTIVE'::public.campaign_status else 'READY'::public.campaign_status end into v_status from public.campaign_runs run where run.campaign_id=p_campaign_id and run.status in ('ACTIVE','SCHEDULED');
  update public.campaigns set status=v_status,paused_at=null where id=p_campaign_id;
  return v_status;
end; $$;

create or replace function public.cancel_campaign_schedule(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  update public.campaign_runs set status='CANCELLED',completed_at=now() where campaign_id=p_campaign_id and status='SCHEDULED' and scheduled_at>now();
  if not found then return false; end if;
  update public.email_queue set status='CANCELLED',completed_at=now() where campaign_run_id in(select id from public.campaign_runs where campaign_id=p_campaign_id and status='CANCELLED') and status in('PENDING','RETRY');
  update public.campaign_run_recipients set status='CANCELLED',completed_at=now() where campaign_run_id in(select id from public.campaign_runs where campaign_id=p_campaign_id and status='CANCELLED') and status='PENDING';
  update public.campaigns set status='READY',scheduled_at=null,schedule_timezone=null,paused_at=null where id=p_campaign_id;
  return true;
end; $$;

create function private.cancel_runs_when_archived()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.campaign_runs set status='CANCELLED',completed_at=now() where campaign_id=new.id and status in('SCHEDULED','ACTIVE','PAUSED');
  end if;
  return new;
end; $$;
create trigger campaigns_cancel_runs_when_archived after update of archived_at on public.campaigns
for each row execute function private.cancel_runs_when_archived();

revoke all on function public.get_campaign_run_readiness(uuid,text) from public,anon;
revoke all on function public.assign_campaign_senders(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.create_campaign_run(uuid,public.runtime_email_mode,integer,public.sender_strategy,uuid[],public.campaign_run_scope,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.get_campaign_run_readiness(uuid,text) to authenticated;
grant execute on function public.assign_campaign_senders(uuid,uuid[]) to authenticated;
grant execute on function public.create_campaign_run(uuid,public.runtime_email_mode,integer,public.sender_strategy,uuid[],public.campaign_run_scope,timestamptz,text,text) to authenticated;

comment on table public.campaign_runs is 'Immutable campaign execution headers. Active status may advance; completed historical runs never reactivate.';
comment on table public.campaign_run_recipients is 'Per-run recipient, sender, and approved content snapshots preserving every execution attempt.';
comment on function public.create_campaign_run(uuid,public.runtime_email_mode,integer,public.sender_strategy,uuid[],public.campaign_run_scope,timestamptz,text,text) is 'Admin-only transactional run creation with campaign locking, sender credential validation, retry filtering, and duplicate-active-run prevention.';
