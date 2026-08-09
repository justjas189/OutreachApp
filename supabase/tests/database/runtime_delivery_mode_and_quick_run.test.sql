begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(31);

select has_table('public', 'application_settings', 'runtime settings table exists');
select has_table('public', 'application_setting_audit', 'delivery-mode audit table exists');
select has_function('public', 'set_runtime_email_mode', array['runtime_email_mode'], 'audited mode RPC exists');
select has_function('public', 'get_campaign_readiness', array['uuid'], 'readiness RPC exists');
select is(
  (select delivery_mode::text from public.application_settings where singleton),
  'preview', 'runtime mode starts in preview'
);

insert into auth.users (id, email, raw_app_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'admin@example.com', '{"role":"admin"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'viewer@example.com', '{}'::jsonb);

insert into public.sender_accounts (id, email, display_name, status, connected_at) values
  ('10000000-0000-4000-8000-000000000010', 'sender@example.com', 'Connected sender', 'CONNECTED', now());
insert into private.sender_credentials (sender_account_id, encrypted_refresh_token) values
  ('10000000-0000-4000-8000-000000000010', 'safe-encrypted-example-token');
insert into public.templates (
  business_type, guide_title, audience, services_focus, body_template, subject_template
) values (
  'Test', 'Example Guide', 'example readers', 'example services',
  'Hello {{NAME}}', 'Example {{NAME}}'
);

insert into public.campaigns (id, name, city, status, created_by, archived_at, paused_at) values
  ('10000000-0000-4000-8000-000000000100', 'Ready campaign', 'Portland', 'READY', '10000000-0000-4000-8000-000000000001', null, null),
  ('10000000-0000-4000-8000-000000000200', 'Unapproved campaign', 'Portland', 'READY', '10000000-0000-4000-8000-000000000001', null, null),
  ('10000000-0000-4000-8000-000000000300', 'No sender campaign', 'Portland', 'READY', '10000000-0000-4000-8000-000000000001', null, null),
  ('10000000-0000-4000-8000-000000000400', 'Paused campaign', 'Portland', 'PAUSED', '10000000-0000-4000-8000-000000000001', null, now()),
  ('10000000-0000-4000-8000-000000000500', 'Archived campaign', 'Portland', 'ARCHIVED', '10000000-0000-4000-8000-000000000001', now(), null),
  ('10000000-0000-4000-8000-000000000600', 'Missing template campaign', 'Portland', 'READY', '10000000-0000-4000-8000-000000000001', null, null),
  ('10000000-0000-4000-8000-000000000700', 'Suppressed campaign', 'Portland', 'READY', '10000000-0000-4000-8000-000000000001', null, null);

insert into public.recipients (
  id, campaign_id, name, email, link, business_type, assigned_sender_id, status
) values
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000100', 'Ready', 'ready@example.com', 'https://example.com/ready', 'Test', '10000000-0000-4000-8000-000000000010', 'APPROVED'),
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000200', 'Unapproved', 'unapproved@example.com', 'https://example.com/unapproved', 'Test', '10000000-0000-4000-8000-000000000010', 'GENERATED'),
  ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000300', 'No sender', 'no.sender@example.com', 'https://example.com/no-sender', 'Test', null, 'APPROVED'),
  ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000400', 'Paused', 'paused@example.com', 'https://example.com/paused', 'Test', '10000000-0000-4000-8000-000000000010', 'APPROVED'),
  ('10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000500', 'Archived', 'archived@example.com', 'https://example.com/archived', 'Test', '10000000-0000-4000-8000-000000000010', 'APPROVED'),
  ('10000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000600', 'Florist', 'florist@example.com', 'https://example.com/florist', 'Florists', '10000000-0000-4000-8000-000000000010', 'APPROVED'),
  ('10000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000700', 'Suppressed', 'suppressed@example.com', 'https://example.com/suppressed', 'Test', '10000000-0000-4000-8000-000000000010', 'APPROVED');

insert into public.email_drafts (
  id, campaign_id, recipient_id, sender_account_id, subject, body, status, approved_at
) values
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000100', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010', 'Ready', 'Safe body', 'APPROVED', now()),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000200', '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000010', 'Unapproved', 'Safe body', 'GENERATED', null),
  ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000300', '10000000-0000-4000-8000-000000000301', null, 'No sender', 'Safe body', 'APPROVED', now()),
  ('10000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000400', '10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000010', 'Paused', 'Safe body', 'APPROVED', now()),
  ('10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000500', '10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000010', 'Archived', 'Safe body', 'APPROVED', now()),
  ('10000000-0000-4000-8000-000000000602', '10000000-0000-4000-8000-000000000600', '10000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000010', 'Florist', 'Safe body', 'APPROVED', now()),
  ('10000000-0000-4000-8000-000000000702', '10000000-0000-4000-8000-000000000700', '10000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000010', 'Suppressed', 'Safe body', 'APPROVED', now());
insert into public.suppression_list (email, reason, source)
values ('suppressed@example.com', 'MANUAL BLOCK', 'ADMIN');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","app_metadata":{}}';

select throws_ok(
  $$select public.set_runtime_email_mode('draft')$$,
  '42501', 'admin access required', 'non-admin cannot change runtime delivery mode'
);
select throws_ok(
  $$select public.get_campaign_readiness('10000000-0000-4000-8000-000000000100')$$,
  '42501', 'admin access required', 'non-admin cannot read readiness RPC'
);

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select is(public.set_runtime_email_mode('draft')::text, 'draft', 'admin can select draft mode');
select is((select delivery_mode::text from public.application_settings where singleton), 'draft', 'draft mode is stored');
select is((select previous_value from public.application_setting_audit order by id desc limit 1), 'preview', 'audit stores previous mode');
select is((select new_value from public.application_setting_audit order by id desc limit 1), 'draft', 'audit stores new mode');
select is((select changed_by::text from public.application_setting_audit order by id desc limit 1), '10000000-0000-4000-8000-000000000001', 'audit stores acting admin');
select ok((select changed_at <= now() from public.application_setting_audit order by id desc limit 1), 'audit stores timestamp');
select is(public.set_runtime_email_mode('live')::text, 'live', 'admin can select live mode');
select is((select count(*)::integer from public.application_setting_audit), 2, 'each changed mode receives one audit row');
select is(public.set_runtime_email_mode('live')::text, 'live', 'reselecting current mode is idempotent');
select is((select count(*)::integer from public.application_setting_audit), 2, 'idempotent selection does not create duplicate audit');

select ok((public.get_campaign_readiness('10000000-0000-4000-8000-000000000100')->>'ready')::boolean, 'approved campaign with credentials is ready');
select is((public.get_campaign_readiness('10000000-0000-4000-8000-000000000100')->>'connectedSenderCount')::integer, 1, 'readiness reports connected sender count');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000200')->'blockingReasons' ? '1 emails still need approval', 'unapproved email blocks Quick Run');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000300')->'blockingReasons' ? 'No connected senders', 'missing connected sender blocks Quick Run');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000400')->'blockingReasons' ? 'Campaign is paused', 'paused campaign blocks Quick Run');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000500')->'blockingReasons' ? 'Campaign is archived', 'archived campaign blocks Quick Run');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000600')->'blockingReasons' ? 'Missing template for Florists', 'missing business template blocks Quick Run');
select ok(public.get_campaign_readiness('10000000-0000-4000-8000-000000000700')->'blockingReasons' ? 'No eligible recipients remain', 'suppressed recipient never becomes run eligible');
select is((public.get_campaign_readiness('10000000-0000-4000-8000-000000000700')->>'suppressedCount')::integer, 1, 'readiness reports suppression count');

select is(
  public.schedule_campaign('10000000-0000-4000-8000-000000000100', now(), 'UTC')::text,
  'ACTIVE', 'Quick Run uses authoritative schedule RPC for send now'
);
select throws_ok(
  $$select public.schedule_campaign('10000000-0000-4000-8000-000000000200', now(), 'UTC')$$,
  '22023', null, 'schedule rejects unapproved campaign'
);

reset role;
select is(public.enqueue_due_campaign_emails('live'), 1, 'ready active campaign enqueues through existing queue logic');
select is(public.enqueue_due_campaign_emails('live'), 0, 'repeated Quick Run worker pass cannot duplicate queue work');
select is((select count(*)::integer from public.email_queue where campaign_id = '10000000-0000-4000-8000-000000000700'), 0, 'suppression remains enforced in live mode');

select * from finish();
rollback;
