alter table public.templates
  add column body_html text,
  add constraint templates_body_html_length check (body_html is null or length(body_html) between 1 and 100000);

alter table public.email_drafts
  add column body_html text,
  add constraint email_drafts_body_html_length check (body_html is null or length(body_html) between 1 and 100000);

alter table public.campaign_run_recipients
  add column body_html text,
  add constraint campaign_run_recipients_body_html_length check (body_html is null or length(body_html) between 1 and 100000);

create or replace function public.store_generated_email_previews(p_campaign_id uuid, p_drafts jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_draft_count integer; v_valid_count integer;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'admin access required' using errcode='42501';
  end if;
  if p_drafts is null or jsonb_typeof(p_drafts)<>'array' or jsonb_array_length(p_drafts) not between 1 and 10000 then
    raise exception 'drafts must be an array containing 1 to 10000 entries' using errcode='22023';
  end if;
  select count(*) into v_draft_count from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid,sender_account_id uuid,subject text,body text,body_html text);
  if (select count(distinct draft.recipient_id) from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid))<>v_draft_count then
    raise exception 'draft recipients must be unique' using errcode='22023';
  end if;
  select count(*) into v_valid_count
  from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid,sender_account_id uuid,subject text,body text,body_html text)
  join public.recipients recipient on recipient.id=draft.recipient_id and recipient.campaign_id=p_campaign_id
    and recipient.status in('PENDING','GENERATED') and recipient.assigned_sender_id=draft.sender_account_id
  join public.sender_accounts sender on sender.id=draft.sender_account_id and sender.status='CONNECTED'
  where length(btrim(draft.subject)) between 1 and 200 and draft.subject !~ E'[\r\n]'
    and length(draft.body) between 1 and 50000 and length(draft.body_html) between 1 and 100000;
  if v_valid_count<>v_draft_count then
    raise exception 'draft entries do not match eligible recipients and connected senders' using errcode='22023';
  end if;
  insert into public.email_drafts(campaign_id,recipient_id,sender_account_id,subject,body,body_html,status)
  select p_campaign_id,draft.recipient_id,draft.sender_account_id,btrim(draft.subject),draft.body,draft.body_html,'GENERATED'
  from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid,sender_account_id uuid,subject text,body text,body_html text)
  on conflict(recipient_id) do update set sender_account_id=excluded.sender_account_id,subject=excluded.subject,
    body=excluded.body,body_html=excluded.body_html,status='GENERATED',gmail_draft_id=null,created_at=now(),approved_at=null,sent_at=null
  where public.email_drafts.status='GENERATED';
  update public.recipients recipient set status='GENERATED',last_error=null where recipient.campaign_id=p_campaign_id
    and recipient.id in(select draft.recipient_id from jsonb_to_recordset(p_drafts) as draft(recipient_id uuid));
  return v_draft_count;
end; $$;

drop function public.approve_email_preview(uuid,text,text);
create function public.approve_email_preview(p_email_draft_id uuid,p_subject text,p_body text,p_body_html text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_recipient_id uuid;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'admin access required' using errcode='42501'; end if;
  if length(btrim(p_subject)) not between 1 and 200 or p_subject~E'[\r\n]'
    or length(p_body) not between 1 and 50000 or length(p_body_html) not between 1 and 100000 then
    raise exception 'email preview content is invalid' using errcode='22023';
  end if;
  update public.email_drafts set subject=btrim(p_subject),body=p_body,body_html=p_body_html,status='APPROVED',approved_at=now()
  where id=p_email_draft_id and status='GENERATED' returning recipient_id into v_recipient_id;
  if v_recipient_id is null then raise exception 'generated email preview not found' using errcode='P0002'; end if;
  update public.recipients set status='APPROVED' where id=v_recipient_id and status='GENERATED';
  return v_recipient_id;
end; $$;
revoke all on function public.approve_email_preview(uuid,text,text,text) from public,anon;
grant execute on function public.approve_email_preview(uuid,text,text,text) to authenticated;

create function private.copy_run_recipient_html()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.body_html is null then select draft.body_html into new.body_html from public.email_drafts draft where draft.id=new.email_draft_id; end if;
  return new;
end; $$;
create trigger campaign_run_recipients_copy_html before insert on public.campaign_run_recipients
for each row execute function private.copy_run_recipient_html();

drop function public.prepare_claimed_email(uuid,uuid);
create function public.prepare_claimed_email(p_queue_id uuid,p_claim_token uuid)
returns table(queue_id uuid,delivery_mode public.email_delivery_mode,recipient_email text,sender_email text,subject text,body text,body_html text,encrypted_refresh_token text)
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
  return query select v_queue.id,v_queue.delivery_mode,v_rr.recipient_email,v_sender.email,v_rr.subject,v_rr.body,v_rr.body_html,v_token;
end; $$;
revoke all on function public.prepare_claimed_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_claimed_email(uuid,uuid) to service_role;

comment on column public.templates.body_html is 'Server-sanitized rich template HTML; null preserves legacy plain-text templates.';
comment on column public.email_drafts.body_html is 'Server-sanitized generated rich email HTML paired with body plain-text fallback.';
comment on column public.campaign_run_recipients.body_html is 'Immutable sanitized rich HTML snapshot for this campaign execution.';
