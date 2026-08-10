begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(38);

select has_column('public', 'campaigns', 'archived_at', 'campaigns stores an archive timestamp');
select has_function('public', 'update_campaign_details', array['uuid', 'text', 'text'], 'campaign edit RPC exists');
select has_function('public', 'manage_campaign_lifecycle', array['uuid'], 'campaign lifecycle RPC exists');

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com', '{"role":"admin"}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'viewer@example.com', '{}'::jsonb);

insert into public.sender_accounts (id, email, display_name, status, connected_at) values
  ('00000000-0000-4000-8000-000000000010', 'sender.one@example.com', 'Sender one', 'CONNECTED', now()),
  ('00000000-0000-4000-8000-000000000011', 'sender.two@example.com', 'Sender two', 'CONNECTED', now());

insert into private.sender_credentials (sender_account_id, encrypted_refresh_token) values
  ('00000000-0000-4000-8000-000000000010', 'safe-encrypted-example-token-one'),
  ('00000000-0000-4000-8000-000000000011', 'safe-encrypted-example-token-two');

insert into public.templates (
  business_type, guide_title, audience, services_focus, body_template, subject_template
) values (
  'Test', 'Example Guide', 'example readers', 'example services',
  'Hello {{NAME}}', 'Example {{NAME}}'
);

insert into public.campaigns (
  id, name, city, status, created_by, scheduled_at, schedule_timezone, started_at
) values
  ('00000000-0000-4000-8000-000000000100', 'Delete me', 'Portland', 'READY', '00000000-0000-4000-8000-000000000001', now() + interval '1 day', 'UTC', null),
  ('00000000-0000-4000-8000-000000000200', 'Archive me', 'Portland', 'ACTIVE', '00000000-0000-4000-8000-000000000001', now() - interval '1 hour', 'UTC', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000300', 'Schedule me', 'Portland', 'READY', '00000000-0000-4000-8000-000000000001', null, null, null),
  ('00000000-0000-4000-8000-000000000400', 'Assign me', 'Portland', 'READY', '00000000-0000-4000-8000-000000000001', null, null, null);

insert into public.recipients (
  id, campaign_id, name, email, link, business_type, assigned_sender_id, status, sent_at
) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000100', 'Delete Recipient', 'delete@example.com', 'https://example.com/delete', 'Test', '00000000-0000-4000-8000-000000000010', 'APPROVED', null),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000200', 'Sent Recipient', 'sent@example.com', 'https://example.com/sent', 'Test', '00000000-0000-4000-8000-000000000010', 'SENT', now() - interval '30 minutes'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000200', 'Queued Recipient', 'queued@example.com', 'https://example.com/queued', 'Test', '00000000-0000-4000-8000-000000000010', 'QUEUED', null),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000300', 'Schedule Recipient', 'schedule@example.com', 'https://example.com/schedule', 'Test', '00000000-0000-4000-8000-000000000010', 'APPROVED', null),
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000400', 'Assign One', 'assign.one@example.com', 'https://example.com/assign-one', 'Test', '00000000-0000-4000-8000-000000000010', 'GENERATED', null),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000400', 'Assign Two', 'assign.two@example.com', 'https://example.com/assign-two', 'Test', '00000000-0000-4000-8000-000000000010', 'GENERATED', null);

insert into public.email_drafts (
  id, campaign_id, recipient_id, sender_account_id, subject, body, status, approved_at, sent_at
) values
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', 'Delete', 'Safe example body', 'APPROVED', now(), null),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000010', 'Sent', 'Safe example body', 'SENT', now() - interval '1 hour', now() - interval '30 minutes'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000010', 'Queued', 'Safe example body', 'QUEUED', now() - interval '1 hour', null),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000300', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000010', 'Schedule', 'Safe example body', 'APPROVED', now(), null),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000400', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000010', 'Assign one', 'Safe example body', 'GENERATED', null, null),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000400', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000010', 'Assign two', 'Safe example body', 'GENERATED', null, null);

insert into public.campaign_runs (
  id, campaign_id, run_number, status, delivery_mode, sender_strategy, selected_sender_ids,
  batch_size, run_scope, scheduled_at, schedule_timezone, started_at, created_by
) values
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000100', 1, 'SCHEDULED', 'live', 'single', array['00000000-0000-4000-8000-000000000010'::uuid], 5, 'all', now() + interval '1 day', 'UTC', null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000200', 1, 'ACTIVE', 'live', 'single', array['00000000-0000-4000-8000-000000000010'::uuid], 5, 'all', now() - interval '1 hour', 'UTC', now() - interval '1 hour', '00000000-0000-4000-8000-000000000001');

insert into public.campaign_run_recipients (
  id, campaign_run_id, campaign_id, recipient_id, email_draft_id, sender_account_id,
  recipient_email, subject, body, status, completed_at
) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000010', 'delete@example.com', 'Delete', 'Safe example body', 'PENDING', null),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000010', 'sent@example.com', 'Sent', 'Safe example body', 'SENT', now() - interval '30 minutes'),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000010', 'queued@example.com', 'Queued', 'Safe example body', 'PENDING', null);

insert into public.email_queue (
  id, email_draft_id, campaign_id, recipient_id, sender_account_id, delivery_mode, status, available_at, attempts, completed_at, campaign_run_id, campaign_run_recipient_id
) values
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', 'live', 'PENDING', now() + interval '1 day', 0, null, '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000111'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000010', 'live', 'COMPLETED', now() - interval '1 hour', 1, now() - interval '30 minutes', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000211'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000010', 'live', 'PENDING', now(), 0, null, '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000212');

insert into public.send_logs (campaign_id, recipient_id, sender_account_id, status, provider_message_id)
values ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000010', 'SENT', 'safe-provider-id');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{}}';

select throws_ok(
  $$select public.update_campaign_details('00000000-0000-4000-8000-000000000100', 'Bad rename', 'Portland')$$,
  '42501', 'admin access required', 'non-admin cannot edit campaigns'
);
select throws_ok(
  $$select public.manage_campaign_lifecycle('00000000-0000-4000-8000-000000000100')$$,
  '42501', 'admin access required', 'non-admin cannot delete or archive campaigns'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select lives_ok(
  $$select public.update_campaign_details('00000000-0000-4000-8000-000000000100', 'Renamed campaign', 'Portland')$$,
  'admin can rename a pre-send campaign'
);
select is(
  (select name from public.campaigns where id = '00000000-0000-4000-8000-000000000100'),
  'Renamed campaign', 'campaign rename is stored'
);
select throws_ok(
  $$select public.update_campaign_details('00000000-0000-4000-8000-000000000100', 'Renamed campaign', 'Seattle')$$,
  '22023', 'city is locked after email previews are generated', 'city cannot invalidate stored previews'
);

select is(
  public.assign_campaign_senders(
    '00000000-0000-4000-8000-000000000400',
    array['00000000-0000-4000-8000-000000000010'::uuid, '00000000-0000-4000-8000-000000000011'::uuid]
  ),
  2, 'sender reassignment updates every pre-send recipient'
);
select is(
  (select count(distinct assigned_sender_id)::integer from public.recipients where campaign_id = '00000000-0000-4000-8000-000000000400'),
  2, 'balanced assignment uses both connected senders'
);
select is(
  (select count(*)::integer from public.email_drafts as draft join public.recipients as recipient on recipient.id = draft.recipient_id where draft.campaign_id = '00000000-0000-4000-8000-000000000400' and draft.sender_account_id = recipient.assigned_sender_id),
  2, 'pre-send draft sender history follows reassignment'
);

select is(
  public.schedule_campaign('00000000-0000-4000-8000-000000000300', now() + interval '2 days', 'Asia/Manila')::text,
  'READY', 'future schedule uses a valid IANA timezone'
);
select is(
  (select schedule_timezone from public.campaigns where id = '00000000-0000-4000-8000-000000000300'),
  'Asia/Manila', 'selected IANA timezone is stored'
);
select lives_ok(
  $$select public.schedule_campaign('00000000-0000-4000-8000-000000000300', now() + interval '3 days', 'UTC')$$,
  'future schedule can be edited before processing'
);
select is(
  (select schedule_timezone from public.campaigns where id = '00000000-0000-4000-8000-000000000300'),
  'UTC', 'edited schedule timezone is stored'
);
reset role;
insert into public.campaign_runs (
  id,campaign_id,run_number,status,delivery_mode,sender_strategy,selected_sender_ids,batch_size,run_scope,scheduled_at,schedule_timezone,created_by
) select '00000000-0000-4000-8000-000000000310',id,1,'SCHEDULED','live','single',array['00000000-0000-4000-8000-000000000010'::uuid],5,'all',scheduled_at,schedule_timezone,created_by
from public.campaigns where id='00000000-0000-4000-8000-000000000300';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select ok(public.cancel_campaign_schedule('00000000-0000-4000-8000-000000000300'), 'future schedule can be cancelled');
select ok(
  (select scheduled_at is null and schedule_timezone is null from public.campaigns where id = '00000000-0000-4000-8000-000000000300'),
  'schedule cancellation clears UTC instant and timezone'
);
select is(
  public.schedule_campaign('00000000-0000-4000-8000-000000000300', now(), 'UTC')::text,
  'ACTIVE', 'send-now schedule becomes active'
);
reset role;
insert into public.campaign_runs (
  id,campaign_id,run_number,status,delivery_mode,sender_strategy,selected_sender_ids,batch_size,run_scope,scheduled_at,schedule_timezone,started_at,created_by
) select '00000000-0000-4000-8000-000000000320',id,2,'ACTIVE','live','single',array['00000000-0000-4000-8000-000000000010'::uuid],5,'all',scheduled_at,schedule_timezone,now(),created_by
from public.campaigns where id='00000000-0000-4000-8000-000000000300';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select ok(public.pause_campaign('00000000-0000-4000-8000-000000000300'), 'active campaign can be paused');
select is(
  (select status::text from public.campaigns where id = '00000000-0000-4000-8000-000000000300'),
  'PAUSED', 'pause stores paused status'
);
select is(public.resume_campaign('00000000-0000-4000-8000-000000000300')::text, 'ACTIVE', 'eligible paused campaign resumes active');

select is(
  public.manage_campaign_lifecycle('00000000-0000-4000-8000-000000000100'),
  'DELETED', 'never-sent campaign is permanently deleted'
);
select is((select count(*)::integer from public.campaigns where id = '00000000-0000-4000-8000-000000000100'), 0, 'deleted campaign row is gone');
select is((select count(*)::integer from public.recipients where campaign_id = '00000000-0000-4000-8000-000000000100'), 0, 'deleted campaign recipients cascade safely');
select is((select count(*)::integer from public.email_drafts where campaign_id = '00000000-0000-4000-8000-000000000100'), 0, 'deleted campaign previews cascade safely');
select is((select count(*)::integer from public.email_queue where campaign_id = '00000000-0000-4000-8000-000000000100'), 0, 'deleted campaign leaves no queue work');

select is(
  public.manage_campaign_lifecycle('00000000-0000-4000-8000-000000000200'),
  'ARCHIVED', 'campaign with sent/history records is archived'
);
select ok(
  (select status = 'ARCHIVED' and archived_at is not null from public.campaigns where id = '00000000-0000-4000-8000-000000000200'),
  'archived campaign has consistent status and timestamp'
);
select ok(
  (select scheduled_at is null and schedule_timezone is null from public.campaigns where id = '00000000-0000-4000-8000-000000000200'),
  'archiving cancels future scheduling'
);
select is(
  (select status::text from public.email_queue where id = '00000000-0000-4000-8000-000000000206'),
  'CANCELLED', 'archiving cancels unsent queue work'
);
select is(
  (select status::text from public.recipients where id = '00000000-0000-4000-8000-000000000201'),
  'SENT', 'archiving preserves sent recipient history'
);
select is(
  (select count(*)::integer from public.send_logs where campaign_id = '00000000-0000-4000-8000-000000000200'),
  1, 'archiving preserves send logs'
);
select is(
  (select count(*)::integer from public.campaigns where id = '00000000-0000-4000-8000-000000000200' and archived_at is null),
  0, 'archived campaign is absent from the default active predicate'
);
select is(
  (select count(*)::integer from public.campaigns where id = '00000000-0000-4000-8000-000000000200' and archived_at is not null),
  1, 'archived campaign remains available to history queries'
);
select throws_ok(
  $$delete from public.campaigns where id = '00000000-0000-4000-8000-000000000200'$$,
  '22023', 'campaign history cannot be permanently deleted', 'archived history cannot be hard-deleted'
);
select throws_ok(
  $$select public.update_campaign_details('00000000-0000-4000-8000-000000000200', 'Changed archive', 'Portland')$$,
  '22023', 'campaign details are locked after sending starts or history exists', 'archived campaign metadata is read-only'
);
select throws_ok(
  $$select public.schedule_campaign('00000000-0000-4000-8000-000000000200', now() + interval '1 day', 'UTC')$$,
  'P0002', 'active campaign not found', 'archived campaign cannot become schedule eligible'
);

reset role;
select is(public.enqueue_due_campaign_emails('live'), 0, 'legacy campaign scheduling does not bypass explicit run creation');

select * from finish();
rollback;
