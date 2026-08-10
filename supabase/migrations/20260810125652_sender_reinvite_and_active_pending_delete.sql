alter table public.sender_accounts
add column invite_creation_key uuid;

create unique index sender_accounts_invite_creation_key_unique
  on public.sender_accounts(invite_creation_key)
  where invite_creation_key is not null;

alter table public.sender_invites
add column invalidated_at timestamptz;

with ranked_current_invites as (
  select id, row_number() over (
    partition by sender_account_id order by created_at desc, id desc
  ) as position
  from public.sender_invites
  where sender_account_id is not null and used_at is null
)
update public.sender_invites as invite
set invalidated_at = now()
from ranked_current_invites as ranked
where invite.id = ranked.id and ranked.position > 1;

create unique index sender_invites_one_current_per_sender_idx
  on public.sender_invites(sender_account_id)
  where sender_account_id is not null and used_at is null and invalidated_at is null;

revoke all on function public.create_sender_invitation(text, text, timestamptz)
from public, anon, authenticated;

create function public.create_or_reinvite_sender(
  p_sender_label text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_key uuid,
  p_sender_account_id uuid default null
)
returns table(sender_account_id uuid, sender_invite_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender public.sender_accounts%rowtype;
  v_sender_invite_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if length(btrim(p_sender_label)) < 2 or length(btrim(p_sender_label)) > 120
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_request_key is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '30 days'
  then
    raise exception 'sender invitation input is invalid' using errcode = '22023';
  end if;

  if p_sender_account_id is null then
    insert into public.sender_accounts(display_name, invite_creation_key)
    values (btrim(p_sender_label), p_request_key)
    on conflict (invite_creation_key) where invite_creation_key is not null
    do update set display_name = public.sender_accounts.display_name
    returning * into v_sender;
  else
    select * into v_sender
    from public.sender_accounts
    where id = p_sender_account_id
    for update;

    if v_sender.id is null
      or v_sender.status <> 'PENDING'
      or v_sender.connected_at is not null
      or v_sender.revoked_at is not null
      or v_sender.email is not null
      or v_sender.google_account_id is not null
      or exists (
        select 1 from private.sender_credentials as credentials
        where credentials.sender_account_id = p_sender_account_id
      )
    then
      raise exception 'only a never-connected pending sender can be re-invited' using errcode = '22023';
    end if;
  end if;

  update public.sender_invites as invite
  set invalidated_at = now()
  where invite.sender_account_id = v_sender.id
    and invite.used_at is null
    and invite.invalidated_at is null;

  delete from private.sender_oauth_states as oauth_state
  using public.sender_invites as invite
  where oauth_state.sender_invite_id = invite.id
    and invite.sender_account_id = v_sender.id
    and invite.invalidated_at is not null
    and oauth_state.used_at is null;

  insert into public.sender_invites(
    expires_at, created_by, sender_label, sender_account_id
  ) values (
    p_expires_at, auth.uid(), v_sender.display_name, v_sender.id
  ) returning id into v_sender_invite_id;

  insert into private.sender_invite_tokens(sender_invite_id, token_hash)
  values (v_sender_invite_id, p_token_hash);

  return query select v_sender.id, v_sender_invite_id;
end;
$$;

revoke all on function public.create_or_reinvite_sender(text, text, timestamptz, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.create_or_reinvite_sender(text, text, timestamptz, uuid, uuid)
to authenticated;

create or replace function public.get_sender_invite_for_connection(p_token_hash text)
returns table(sender_invite_id uuid,sender_account_id uuid,sender_label text,expires_at timestamptz,used_at timestamptz)
language sql stable security definer set search_path='' as $$
  select invite.id,invite.sender_account_id,invite.sender_label,invite.expires_at,invite.used_at
  from private.sender_invite_tokens token
  join public.sender_invites invite on invite.id=token.sender_invite_id
  where token.token_hash=p_token_hash and invite.invalidated_at is null
  limit 1;
$$;

create or replace function public.begin_sender_oauth(p_token_hash text,p_state_hash text,p_encrypted_code_verifier text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite_id uuid; v_state_id uuid;
begin
  if p_state_hash !~ '^[0-9a-f]{64}$' or length(p_encrypted_code_verifier)<40 then raise exception 'OAuth state is invalid' using errcode='22023'; end if;
  select invite.id into v_invite_id
  from private.sender_invite_tokens token join public.sender_invites invite on invite.id=token.sender_invite_id
  where token.token_hash=p_token_hash and invite.sender_account_id is not null and invite.used_at is null
    and invite.invalidated_at is null and invite.expires_at>now()
  for update of invite;
  if v_invite_id is null then raise exception 'sender invitation is invalid or unavailable' using errcode='22023'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '15 minutes' or p_expires_at>(select expires_at from public.sender_invites where id=v_invite_id) then raise exception 'OAuth state expiry is invalid' using errcode='22023'; end if;
  update private.sender_oauth_states set used_at=now() where sender_invite_id=v_invite_id and used_at is null;
  insert into private.sender_oauth_states(sender_invite_id,state_hash,encrypted_code_verifier,expires_at)
  values(v_invite_id,p_state_hash,p_encrypted_code_verifier,p_expires_at) returning id into v_state_id;
  return v_state_id;
end; $$;

create or replace function public.consume_sender_oauth_state(p_state_hash text)
returns table(sender_invite_id uuid,encrypted_code_verifier text)
language plpgsql security definer set search_path='' as $$
begin
  return query update private.sender_oauth_states oauth_state set used_at=now()
  where oauth_state.state_hash=p_state_hash and oauth_state.used_at is null and oauth_state.expires_at>now()
    and exists(select 1 from public.sender_invites invite where invite.id=oauth_state.sender_invite_id
      and invite.used_at is null and invite.invalidated_at is null and invite.expires_at>now())
  returning oauth_state.sender_invite_id,oauth_state.encrypted_code_verifier;
end; $$;

create or replace function public.complete_sender_connection(p_sender_invite_id uuid,p_email text,p_google_account_id text,p_encrypted_refresh_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite public.sender_invites%rowtype;
begin
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(btrim(p_google_account_id))=0 or length(p_encrypted_refresh_token)<40 then raise exception 'sender connection details are invalid' using errcode='22023'; end if;
  select * into v_invite from public.sender_invites where id=p_sender_invite_id for update;
  if v_invite.id is null or v_invite.sender_account_id is null or v_invite.used_at is not null or v_invite.invalidated_at is not null or v_invite.expires_at<=now() then raise exception 'sender invitation is invalid or unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.sender_accounts where id<>v_invite.sender_account_id and (lower(email)=lower(btrim(p_email)) or google_account_id=btrim(p_google_account_id))) then raise exception 'Google account is already connected' using errcode='23505'; end if;
  update public.sender_accounts set email=lower(btrim(p_email)),status='CONNECTED',google_account_id=btrim(p_google_account_id),connected_at=now(),revoked_at=null where id=v_invite.sender_account_id;
  insert into private.sender_credentials(sender_account_id,encrypted_refresh_token) values(v_invite.sender_account_id,p_encrypted_refresh_token)
  on conflict(sender_account_id) do update set encrypted_refresh_token=excluded.encrypted_refresh_token,updated_at=now();
  update public.sender_invites set used_at=now() where id=v_invite.id;
  return v_invite.sender_account_id;
end; $$;

create or replace function public.get_pending_sender_delete_eligibility(p_sender_account_id uuid)
returns table(eligible boolean,reason text) language plpgsql security definer set search_path='' as $$
declare v_sender public.sender_accounts%rowtype; v_latest_invite public.sender_invites%rowtype;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  select * into v_sender from public.sender_accounts where id=p_sender_account_id;
  if v_sender.id is null then return query select false,'Sender not found.'::text; return; end if;
  if v_sender.status<>'PENDING' or v_sender.connected_at is not null or v_sender.revoked_at is not null or v_sender.email is not null or v_sender.google_account_id is not null then return query select false,'Only never-connected pending senders can be deleted.'::text; return; end if;
  select * into v_latest_invite from public.sender_invites where sender_account_id=p_sender_account_id order by created_at desc,id desc limit 1;
  if v_latest_invite.id is null or v_latest_invite.used_at is not null then return query select false,'Sender has no unused invitation.'::text; return; end if;
  if exists(select 1 from public.sender_invites where sender_account_id=p_sender_account_id and used_at is not null)
    or exists(select 1 from private.sender_credentials where sender_account_id=p_sender_account_id) then return query select false,'Sender has connection history or stored credentials.'::text; return; end if;
  if exists(select 1 from public.recipients where assigned_sender_id=p_sender_account_id)
    or exists(select 1 from public.email_drafts where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.campaign_run_recipients where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.email_queue where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.send_logs where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.campaign_runs where p_sender_account_id=any(selected_sender_ids)) then return query select false,'Sender is referenced by campaign or delivery history.'::text; return; end if;
  return query select true,null::text;
end; $$;

create or replace function public.delete_expired_pending_sender(p_sender_account_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_sender public.sender_accounts%rowtype; v_latest_invite public.sender_invites%rowtype;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  select * into v_sender from public.sender_accounts where id=p_sender_account_id for update;
  if v_sender.id is null then raise exception 'sender not found' using errcode='P0002'; end if;
  select * into v_latest_invite from public.sender_invites where sender_account_id=p_sender_account_id order by created_at desc,id desc limit 1 for update;
  if v_sender.status<>'PENDING' or v_sender.connected_at is not null or v_sender.revoked_at is not null or v_sender.email is not null or v_sender.google_account_id is not null
    or v_latest_invite.id is null or v_latest_invite.used_at is not null
    or exists(select 1 from public.sender_invites where sender_account_id=p_sender_account_id and used_at is not null)
    or exists(select 1 from private.sender_credentials where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.recipients where assigned_sender_id=p_sender_account_id)
    or exists(select 1 from public.email_drafts where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.campaign_run_recipients where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.email_queue where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.send_logs where sender_account_id=p_sender_account_id)
    or exists(select 1 from public.campaign_runs where p_sender_account_id=any(selected_sender_ids)) then raise exception 'sender is not eligible for pending deletion' using errcode='22023'; end if;
  update public.sender_invites set invalidated_at=coalesce(invalidated_at,now()) where sender_account_id=p_sender_account_id and used_at is null;
  delete from public.sender_accounts where id=p_sender_account_id;
  return found;
end; $$;

comment on column public.sender_invites.invalidated_at is 'Set when an unused invitation is superseded or its pending sender is deleted.';
comment on function public.create_or_reinvite_sender(text,text,timestamptz,uuid,uuid) is 'Creates one logical sender or reuses a locked pending sender while invalidating every previous unused invitation.';
