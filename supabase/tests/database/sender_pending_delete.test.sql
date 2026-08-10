begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);

insert into auth.users(id,email,raw_app_meta_data) values
('30000000-0000-4000-8000-000000000001','admin@example.com','{"role":"admin"}'::jsonb);

insert into public.sender_accounts(id,email,display_name,status,connected_at) values
('30000000-0000-4000-8000-000000000010',null,'Expired unused','PENDING',null),
('30000000-0000-4000-8000-000000000011',null,'Active invite','PENDING',null),
('30000000-0000-4000-8000-000000000012','connected@example.com','Connected','CONNECTED',now()),
('30000000-0000-4000-8000-000000000013',null,'Assigned history','PENDING',null),
('30000000-0000-4000-8000-000000000014',null,'Send history','PENDING',null);

insert into public.sender_invites(id,expires_at,created_by,sender_label,sender_account_id,invalidated_at) values
('30000000-0000-4000-8000-000000000020',now()-interval '2 days','30000000-0000-4000-8000-000000000001','Expired unused','30000000-0000-4000-8000-000000000010',now()-interval '1 day'),
('30000000-0000-4000-8000-000000000021',now()-interval '1 day','30000000-0000-4000-8000-000000000001','Expired unused','30000000-0000-4000-8000-000000000010',null),
('30000000-0000-4000-8000-000000000022',now()+interval '1 day','30000000-0000-4000-8000-000000000001','Active invite','30000000-0000-4000-8000-000000000011',null),
('30000000-0000-4000-8000-000000000023',now()-interval '1 day','30000000-0000-4000-8000-000000000001','Connected','30000000-0000-4000-8000-000000000012',null),
('30000000-0000-4000-8000-000000000024',now()-interval '1 day','30000000-0000-4000-8000-000000000001','Assigned history','30000000-0000-4000-8000-000000000013',null),
('30000000-0000-4000-8000-000000000025',now()-interval '1 day','30000000-0000-4000-8000-000000000001','Send history','30000000-0000-4000-8000-000000000014',null);

insert into private.sender_invite_tokens(sender_invite_id,token_hash) values
('30000000-0000-4000-8000-000000000020',repeat('a',64)),
('30000000-0000-4000-8000-000000000021',repeat('b',64)),
('30000000-0000-4000-8000-000000000022',repeat('d',64));
insert into private.sender_oauth_states(sender_invite_id,state_hash,encrypted_code_verifier,expires_at) values
('30000000-0000-4000-8000-000000000021',repeat('c',64),repeat('x',40),now()+interval '5 minutes');

insert into public.campaigns(id,name,city,status,created_by) values
('30000000-0000-4000-8000-000000000100','History','Portland','COMPLETED','30000000-0000-4000-8000-000000000001');
insert into public.recipients(id,campaign_id,name,email,link,business_type,status,sent_at) values
('30000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000100','Test','test@example.com','https://example.com','Test','SENT',now());
insert into public.campaign_runs(id,campaign_id,run_number,status,delivery_mode,sender_strategy,selected_sender_ids,batch_size,run_scope,scheduled_at,schedule_timezone,created_by,completed_at) values
('30000000-0000-4000-8000-000000000110','30000000-0000-4000-8000-000000000100',1,'COMPLETED','live','single',array['30000000-0000-4000-8000-000000000013'::uuid],1,'all',now(),'UTC','30000000-0000-4000-8000-000000000001',now());
insert into public.send_logs(campaign_id,recipient_id,sender_account_id,status) values
('30000000-0000-4000-8000-000000000100','30000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000014','SENT');

set local role authenticated;
set local request.jwt.claims='{}';
select throws_ok($$select public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000010')$$,'42501','admin access required','unauthorized user cannot delete sender');

set local request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select ok((select eligible from public.get_pending_sender_delete_eligibility('30000000-0000-4000-8000-000000000010')),'expired never-connected sender is eligible');
select ok((select eligible from public.get_pending_sender_delete_eligibility('30000000-0000-4000-8000-000000000011')),'active invite never-connected sender is eligible');
select isnt((select eligible from public.get_pending_sender_delete_eligibility('30000000-0000-4000-8000-000000000012')),true,'connected sender is blocked');
select isnt((select eligible from public.get_pending_sender_delete_eligibility('30000000-0000-4000-8000-000000000013')),true,'campaign-run sender history blocks deletion');
select isnt((select eligible from public.get_pending_sender_delete_eligibility('30000000-0000-4000-8000-000000000014')),true,'send history blocks deletion');
select ok(public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000011'),'active pending sender and invite are deleted transactionally');
select throws_ok($$select public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000012')$$,'22023','sender is not eligible for pending deletion','connected sender cannot use delete RPC');
select throws_ok($$select public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000013')$$,'22023','sender is not eligible for pending deletion','historical assignment cannot use delete RPC');
select throws_ok($$select public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000014')$$,'22023','sender is not eligible for pending deletion','send history cannot use delete RPC');
select ok(public.delete_expired_pending_sender('30000000-0000-4000-8000-000000000010'),'eligible sender is deleted');
reset role;
select is((select count(*)::integer from public.sender_accounts where id='30000000-0000-4000-8000-000000000010'),0,'sender record removed');
select is((select count(*)::integer from public.sender_invites where sender_account_id='30000000-0000-4000-8000-000000000010'),0,'related invitations removed');
select is((select count(*)::integer from private.sender_invite_tokens where sender_invite_id in ('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000021')),0,'no invite token orphans remain');
select is((select count(*)::integer from private.sender_oauth_states where sender_invite_id in ('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000021')),0,'no OAuth state orphans remain');

select * from finish();
rollback;
