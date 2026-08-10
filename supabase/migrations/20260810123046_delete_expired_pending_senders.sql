create function public.get_pending_sender_delete_eligibility(p_sender_account_id uuid)
returns table(eligible boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender public.sender_accounts%rowtype;
  v_latest_invite public.sender_invites%rowtype;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select * into v_sender
  from public.sender_accounts
  where id = p_sender_account_id;

  if v_sender.id is null then
    return query select false, 'Sender not found.'::text;
    return;
  end if;

  if v_sender.status <> 'PENDING'
    or v_sender.connected_at is not null
    or v_sender.revoked_at is not null
    or v_sender.email is not null
    or v_sender.google_account_id is not null
  then
    return query select false, 'Only never-connected pending senders can be deleted.'::text;
    return;
  end if;

  select * into v_latest_invite
  from public.sender_invites
  where sender_account_id = p_sender_account_id
  order by created_at desc, id desc
  limit 1;

  if v_latest_invite.id is null
    or v_latest_invite.used_at is not null
    or v_latest_invite.expires_at > now()
  then
    return query select false, 'Latest invitation is still active or was used.'::text;
    return;
  end if;

  if exists (
    select 1 from public.sender_invites
    where sender_account_id = p_sender_account_id and used_at is not null
  ) or exists (
    select 1 from private.sender_credentials
    where sender_account_id = p_sender_account_id
  ) then
    return query select false, 'Sender has connection history or stored credentials.'::text;
    return;
  end if;

  if exists (select 1 from public.recipients where assigned_sender_id = p_sender_account_id)
    or exists (select 1 from public.email_drafts where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.campaign_run_recipients where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.email_queue where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.send_logs where sender_account_id = p_sender_account_id)
    or exists (
      select 1 from public.campaign_runs
      where p_sender_account_id = any(selected_sender_ids)
    )
  then
    return query select false, 'Sender is referenced by campaign or delivery history.'::text;
    return;
  end if;

  return query select true, null::text;
end;
$$;

create function public.delete_expired_pending_sender(p_sender_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender public.sender_accounts%rowtype;
  v_latest_invite public.sender_invites%rowtype;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select * into v_sender
  from public.sender_accounts
  where id = p_sender_account_id
  for update;

  if v_sender.id is null then
    raise exception 'sender not found' using errcode = 'P0002';
  end if;

  select * into v_latest_invite
  from public.sender_invites
  where sender_account_id = p_sender_account_id
  order by created_at desc, id desc
  limit 1
  for update;

  if v_sender.status <> 'PENDING'
    or v_sender.connected_at is not null
    or v_sender.revoked_at is not null
    or v_sender.email is not null
    or v_sender.google_account_id is not null
    or v_latest_invite.id is null
    or v_latest_invite.used_at is not null
    or v_latest_invite.expires_at > now()
    or exists (
      select 1 from public.sender_invites
      where sender_account_id = p_sender_account_id and used_at is not null
    )
    or exists (
      select 1 from private.sender_credentials
      where sender_account_id = p_sender_account_id
    )
    or exists (select 1 from public.recipients where assigned_sender_id = p_sender_account_id)
    or exists (select 1 from public.email_drafts where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.campaign_run_recipients where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.email_queue where sender_account_id = p_sender_account_id)
    or exists (select 1 from public.send_logs where sender_account_id = p_sender_account_id)
    or exists (
      select 1 from public.campaign_runs
      where p_sender_account_id = any(selected_sender_ids)
    )
  then
    raise exception 'sender is not eligible for pending deletion' using errcode = '22023';
  end if;

  delete from public.sender_accounts where id = p_sender_account_id;
  return found;
end;
$$;

revoke all on function public.get_pending_sender_delete_eligibility(uuid)
from public, anon, authenticated;
grant execute on function public.get_pending_sender_delete_eligibility(uuid)
to authenticated;

revoke all on function public.delete_expired_pending_sender(uuid)
from public, anon, authenticated;
grant execute on function public.delete_expired_pending_sender(uuid)
to authenticated;

comment on function public.get_pending_sender_delete_eligibility(uuid) is
  'Admin-only advisory check for permanently deleting an expired, never-connected, unreferenced sender slot.';
comment on function public.delete_expired_pending_sender(uuid) is
  'Atomically rechecks all pending sender deletion safeguards before removing an unused sender and cascading its unused invitations.';
