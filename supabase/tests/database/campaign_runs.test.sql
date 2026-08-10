begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

select has_table('public','campaign_runs','campaign run history table exists');
select has_table('public','campaign_run_recipients','run recipient snapshots exist');
select has_function('public','create_campaign_run',array['uuid','runtime_email_mode','integer','sender_strategy','uuid[]','campaign_run_scope','timestamptz','text','text'],'atomic run RPC exists');

insert into auth.users(id,email,raw_app_meta_data) values
('20000000-0000-4000-8000-000000000001','admin@example.com','{"role":"admin"}'::jsonb);
insert into public.sender_accounts(id,email,display_name,status,connected_at) values
('20000000-0000-4000-8000-000000000010','one@example.com','One','CONNECTED',now()),
('20000000-0000-4000-8000-000000000011','two@example.com','Two','CONNECTED',now()),
('20000000-0000-4000-8000-000000000012',null,'Disconnected','PENDING',null);
insert into private.sender_credentials(sender_account_id,encrypted_refresh_token) values
('20000000-0000-4000-8000-000000000010','safe-encrypted-token-one'),
('20000000-0000-4000-8000-000000000011','safe-encrypted-token-two');
insert into public.campaigns(id,name,city,status,created_by) values
('20000000-0000-4000-8000-000000000100','Run campaign','Portland','READY','20000000-0000-4000-8000-000000000001');
insert into public.recipients(id,campaign_id,name,email,link,business_type,assigned_sender_id,status) values
('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000100','A','a@example.com','https://example.com/a','Test','20000000-0000-4000-8000-000000000010','APPROVED'),
('20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000100','B','b@example.com','https://example.com/b','Test','20000000-0000-4000-8000-000000000010','APPROVED'),
('20000000-0000-4000-8000-000000000103','20000000-0000-4000-8000-000000000100','C','c@example.com','https://example.com/c','Test','20000000-0000-4000-8000-000000000010','APPROVED');
insert into public.email_drafts(id,campaign_id,recipient_id,sender_account_id,subject,body,status,approved_at) values
('20000000-0000-4000-8000-000000000111','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000010','A','Body A','APPROVED',now()),
('20000000-0000-4000-8000-000000000112','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000010','B','Body B','APPROVED',now()),
('20000000-0000-4000-8000-000000000113','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000103','20000000-0000-4000-8000-000000000010','C','Body C','APPROVED',now());

set local role authenticated;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select lives_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','draft',1,'single',array['20000000-0000-4000-8000-000000000010'::uuid],'all',now(),'UTC','allowlist')$$,'single sender run starts');
select is((select count(distinct sender_account_id)::integer from public.campaign_run_recipients),1,'single sender receives all recipients');
select is((select count(*)::integer from public.campaign_run_recipients),3,'all eligible recipients snapshot into run');
select throws_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','draft',1,'single',array['20000000-0000-4000-8000-000000000010'::uuid],'all',now(),'UTC','allowlist')$$,'23505','campaign already has an active run','duplicate active run is prevented');
select throws_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','draft',1,'single',array['20000000-0000-4000-8000-000000000012'::uuid],'all',now(),'UTC','allowlist')$$,'23505','campaign already has an active run','concurrent run blocks before sender replacement');

reset role;
update public.email_queue set status='COMPLETED',completed_at=now();
update public.campaign_run_recipients set status='DRAFTED',completed_at=now();
update public.campaign_runs set status='COMPLETED',completed_at=now();
update public.campaigns set status='COMPLETED',completed_at=now();
set local role authenticated;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select lives_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','live',2,'balanced',array['20000000-0000-4000-8000-000000000010'::uuid,'20000000-0000-4000-8000-000000000011'::uuid],'all',now(),'UTC','production')$$,'completed campaign creates run two');
select is((select max(run_number) from public.campaign_runs),2,'rerun increments run number');
select is((select count(distinct sender_account_id)::integer from public.campaign_run_recipients where campaign_run_id=(select id from public.campaign_runs where run_number=2)),2,'balanced selected senders both receive assignments');
select is((select count(*)::integer from public.campaign_run_recipients where campaign_run_id=(select id from public.campaign_runs where run_number=2) and sender_account_id='20000000-0000-4000-8000-000000000012'),0,'unselected sender receives no assignment');
select is((select count(*)::integer from public.campaign_run_recipients where campaign_run_id=(select id from public.campaign_runs where run_number=1)),3,'historical run assignments remain unchanged');
select is((select count(*)::integer from public.email_queue),6,'rerun creates new queue records without resetting old rows');

reset role;
update public.email_queue set status='COMPLETED',completed_at=coalesce(completed_at,now()) where campaign_run_id=(select id from public.campaign_runs where run_number=2);
update public.campaign_run_recipients set status='SENT',completed_at=now() where campaign_run_id=(select id from public.campaign_runs where run_number=2);
update public.campaign_run_recipients set status='FAILED',last_error_code='gmail_503',last_error_message='Temporary provider failure',completed_at=now() where campaign_run_id=(select id from public.campaign_runs where run_number=2) and recipient_id='20000000-0000-4000-8000-000000000101';
update public.campaign_runs set status='FAILED',completed_at=now() where run_number=2;
update public.campaigns set status='FAILED',completed_at=now();
set local role authenticated;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select ok((public.get_campaign_run_readiness('20000000-0000-4000-8000-000000000100','allowlist')->>'canRetryFailed')::boolean,'corrected transient failure is retryable deliberately');
select lives_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','live',1,'single',array['20000000-0000-4000-8000-000000000011'::uuid],'failed',now(),'UTC','allowlist')$$,'failed-only retry creates new run');
select is((select count(*)::integer from public.campaign_run_recipients where campaign_run_id=(select id from public.campaign_runs where run_number=3)),1,'failed-only retry snapshots only failed recipient');
select is((select status::text from public.campaign_run_recipients where campaign_run_id=(select id from public.campaign_runs where run_number=2) and recipient_id='20000000-0000-4000-8000-000000000101'),'FAILED','historical failed attempt stays failed');
select is((select retry_of_run_id from public.campaign_runs where run_number=3),(select id from public.campaign_runs where run_number=2),'retry relationship is preserved');

reset role;
update public.email_queue set status='FAILED',completed_at=coalesce(completed_at,now()),last_error_code='recipient_not_allowlisted' where campaign_run_id=(select id from public.campaign_runs where run_number=3);
update public.campaign_run_recipients set status='FAILED',completed_at=now(),last_error_code='recipient_not_allowlisted',last_error_message='Recipient not allowlisted' where campaign_run_id=(select id from public.campaign_runs where run_number=3);
update public.campaign_runs set status='FAILED',completed_at=now() where run_number=3;
update public.campaigns set status='FAILED';
set local role authenticated;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select is((public.get_campaign_run_readiness('20000000-0000-4000-8000-000000000100','allowlist')->>'failedEligibleCount')::integer,1,'older corrected transient failure remains independently retryable');
select is((public.get_campaign_run_readiness('20000000-0000-4000-8000-000000000100','production')->>'failedEligibleCount')::integer,1,'not-allowlisted failure becomes eligible only after production guard authority');
select throws_ok($$select public.create_campaign_run('20000000-0000-4000-8000-000000000100','live',1,'single',array['20000000-0000-4000-8000-000000000012'::uuid],'failed',now(),'UTC','production')$$,'22023','only connected senders with credentials may be selected','disconnected sender cannot be selected');

select * from finish();
rollback;
