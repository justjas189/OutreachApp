create type public.runtime_email_mode as enum ('preview', 'draft', 'live');

create table public.application_settings (
  singleton boolean primary key default true,
  delivery_mode public.runtime_email_mode not null default 'preview',
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint application_settings_singleton check (singleton)
);

create table public.application_setting_audit (
  id bigint generated always as identity primary key,
  setting_name text not null,
  previous_value text not null,
  new_value text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint application_setting_audit_name check (setting_name = 'delivery_mode'),
  constraint application_setting_audit_previous_mode check (previous_value in ('preview', 'draft', 'live')),
  constraint application_setting_audit_new_mode check (new_value in ('preview', 'draft', 'live'))
);

insert into public.application_settings (singleton, delivery_mode)
values (true, 'preview');

create index application_setting_audit_changed_at_idx
  on public.application_setting_audit (changed_at desc, id desc);

alter table public.application_settings enable row level security;
alter table public.application_setting_audit enable row level security;

revoke all on table public.application_settings, public.application_setting_audit
from public, anon, authenticated;
grant select on table public.application_settings, public.application_setting_audit
to authenticated, service_role;

create policy "admins view application settings"
on public.application_settings for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "admins view application setting audit"
on public.application_setting_audit for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create function public.set_runtime_email_mode(p_mode public.runtime_email_mode)
returns public.runtime_email_mode
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.runtime_email_mode;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select delivery_mode into v_previous
  from public.application_settings
  where singleton
  for update;

  if v_previous is null then
    raise exception 'runtime delivery setting is unavailable' using errcode = 'P0002';
  end if;

  if v_previous = p_mode then
    return v_previous;
  end if;

  update public.application_settings
  set delivery_mode = p_mode,
      updated_by = auth.uid(),
      updated_at = now()
  where singleton;

  insert into public.application_setting_audit (
    setting_name,
    previous_value,
    new_value,
    changed_by
  ) values (
    'delivery_mode',
    v_previous::text,
    p_mode::text,
    auth.uid()
  );

  return p_mode;
end;
$$;

create function private.get_campaign_readiness(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_recipient_count integer;
  v_eligible_count integer;
  v_suppressed_count integer;
  v_generated_count integer;
  v_approved_count integer;
  v_unapproved_count integer;
  v_connected_sender_count integer;
  v_unassigned_count integer;
  v_missing_template_types text[];
  v_queue_count integer;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where recipient.status = 'SUPPRESSED'
        or exists (
          select 1 from public.suppression_list as suppression
          where suppression.email = recipient.email
        )
    )::integer,
    count(*) filter (
      where recipient.status not in ('SENT', 'SUPPRESSED')
        and not exists (
          select 1 from public.suppression_list as suppression
          where suppression.email = recipient.email
        )
    )::integer
  into v_recipient_count, v_suppressed_count, v_eligible_count
  from public.recipients as recipient
  where recipient.campaign_id = p_campaign_id;

  select
    count(draft.id)::integer,
    count(draft.id) filter (where draft.status = 'APPROVED')::integer,
    count(draft.id) filter (
      where draft.status <> 'APPROVED' or recipient.status <> 'APPROVED'
    )::integer
  into v_generated_count, v_approved_count, v_unapproved_count
  from public.recipients as recipient
  left join public.email_drafts as draft on draft.recipient_id = recipient.id
  where recipient.campaign_id = p_campaign_id
    and recipient.status not in ('SENT', 'SUPPRESSED')
    and not exists (
      select 1 from public.suppression_list as suppression
      where suppression.email = recipient.email
    );

  select
    count(distinct sender.id) filter (
      where sender.status = 'CONNECTED'
        and credentials.sender_account_id is not null
    )::integer,
    count(*) filter (
      where sender.id is null
        or sender.status <> 'CONNECTED'
        or credentials.sender_account_id is null
    )::integer
  into v_connected_sender_count, v_unassigned_count
  from public.recipients as recipient
  left join public.sender_accounts as sender on sender.id = recipient.assigned_sender_id
  left join private.sender_credentials as credentials on credentials.sender_account_id = sender.id
  where recipient.campaign_id = p_campaign_id
    and recipient.status not in ('SENT', 'SUPPRESSED')
    and not exists (
      select 1 from public.suppression_list as suppression
      where suppression.email = recipient.email
    );

  select array_agg(missing.business_type order by missing.business_type)
  into v_missing_template_types
  from (
    select distinct btrim(recipient.business_type) as business_type
    from public.recipients as recipient
    where recipient.campaign_id = p_campaign_id
      and recipient.status not in ('SENT', 'SUPPRESSED')
      and not exists (
        select 1 from public.suppression_list as suppression
        where suppression.email = recipient.email
      )
      and not exists (
        select 1 from public.templates as template
        where lower(btrim(template.business_type)) = lower(btrim(recipient.business_type))
      )
  ) as missing;

  select count(*)::integer into v_queue_count
  from public.email_queue
  where campaign_id = p_campaign_id;

  if v_campaign.status = 'ARCHIVED' or v_campaign.archived_at is not null then
    v_reasons := v_reasons || jsonb_build_array('Campaign is archived');
  elsif v_campaign.status = 'PAUSED' or v_campaign.paused_at is not null then
    v_reasons := v_reasons || jsonb_build_array('Campaign is paused');
  elsif v_campaign.status = 'COMPLETED' then
    v_reasons := v_reasons || jsonb_build_array('Campaign is completed');
  elsif v_campaign.status not in ('READY', 'ACTIVE') then
    v_reasons := v_reasons || jsonb_build_array('Campaign is not active');
  end if;

  if v_recipient_count = 0 then
    v_reasons := v_reasons || jsonb_build_array('No recipients');
  elsif v_eligible_count = 0 then
    v_reasons := v_reasons || jsonb_build_array('No eligible recipients remain');
  end if;

  if v_eligible_count > 0 and v_connected_sender_count = 0 then
    v_reasons := v_reasons || jsonb_build_array('No connected senders');
  elsif v_unassigned_count > 0 then
    v_reasons := v_reasons || jsonb_build_array(format('%s recipients need a connected sender', v_unassigned_count));
  end if;

  if coalesce(array_length(v_missing_template_types, 1), 0) > 0 then
    v_reasons := v_reasons || jsonb_build_array(
      format('Missing template for %s', array_to_string(v_missing_template_types, ', '))
    );
  end if;

  if v_eligible_count > v_generated_count then
    v_reasons := v_reasons || jsonb_build_array(
      format('%s emails have not been generated', v_eligible_count - v_generated_count)
    );
  end if;

  if v_unapproved_count > 0 then
    v_reasons := v_reasons || jsonb_build_array(
      format('%s emails still need approval', v_unapproved_count)
    );
  end if;

  if v_queue_count > 0 then
    v_reasons := v_reasons || jsonb_build_array('Campaign already has queue history');
  end if;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_reasons) = 0,
    'blockingReasons', v_reasons,
    'recipientCount', v_recipient_count,
    'eligibleCount', v_eligible_count,
    'generatedCount', v_generated_count,
    'approvedCount', v_approved_count,
    'suppressedCount', v_suppressed_count,
    'connectedSenderCount', v_connected_sender_count,
    'scheduledAt', v_campaign.scheduled_at,
    'scheduleTimezone', v_campaign.schedule_timezone
  );
end;
$$;

create function public.get_campaign_readiness(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return private.get_campaign_readiness(p_campaign_id);
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
  v_readiness jsonb;
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

  v_readiness := public.get_campaign_readiness(p_campaign_id);
  if not (v_readiness ->> 'ready')::boolean then
    raise exception 'campaign is not ready: %', v_readiness -> 'blockingReasons'
      using errcode = '22023';
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

create or replace function public.enqueue_due_campaign_emails(p_delivery_mode public.email_delivery_mode)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
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

  update public.campaigns as campaign
  set status = 'ACTIVE', started_at = coalesce(started_at, now())
  where campaign.status = 'READY'
    and campaign.archived_at is null
    and campaign.scheduled_at <= now()
    and (private.get_campaign_readiness(campaign.id) ->> 'ready')::boolean;

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
      and (private.get_campaign_readiness(campaign.id) ->> 'ready')::boolean
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

revoke all on function private.get_campaign_readiness(uuid) from public, anon, authenticated;
revoke all on function public.set_runtime_email_mode(public.runtime_email_mode) from public, anon, authenticated;
revoke all on function public.get_campaign_readiness(uuid) from public, anon, authenticated;
grant execute on function public.set_runtime_email_mode(public.runtime_email_mode) to authenticated;
grant execute on function public.get_campaign_readiness(uuid) to authenticated;

comment on table public.application_settings is
  'Singleton runtime settings. Delivery mode starts in preview and remains subject to the server EMAIL_MODE deployment ceiling.';
comment on table public.application_setting_audit is
  'Append-only audit history for authenticated admin delivery-mode changes.';
comment on function public.get_campaign_readiness(uuid) is
  'Admin-only readiness summary shared by campaign UI, Quick Run, scheduling, and queue eligibility.';
