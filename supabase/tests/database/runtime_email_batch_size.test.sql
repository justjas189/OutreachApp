begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(23);

select has_column('public', 'application_settings', 'email_batch_size', 'runtime settings include email batch size');
select col_not_null('public', 'application_settings', 'email_batch_size', 'runtime batch size is not null');
select has_function(
  'public',
  'set_runtime_email_batch_size',
  array['integer', 'boolean'],
  'audited runtime batch-size RPC exists'
);
select is(
  (select email_batch_size from public.application_settings where singleton),
  5,
  'runtime batch size starts conservatively at five'
);

insert into auth.users (id, email, raw_app_meta_data) values
  ('20000000-0000-4000-8000-000000000001', 'batch.admin@example.com', '{"role":"admin"}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'batch.viewer@example.com', '{}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{}}';

select throws_ok(
  $$select public.set_runtime_email_batch_size(10, false)$$,
  '42501',
  'admin access required',
  'non-admin cannot change runtime batch size'
);
select is(
  (select count(*)::integer from public.application_settings),
  0,
  'non-admin cannot read runtime settings through RLS'
);
select throws_ok(
  $$update public.application_settings set email_batch_size = 10 where singleton$$,
  '42501',
  null,
  'authenticated users cannot bypass RPC with direct update'
);

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select is(public.set_runtime_email_batch_size(1, false), 1, 'minimum runtime batch size works');
select is((select email_batch_size from public.application_settings where singleton), 1, 'minimum value is stored');
select is(
  (select previous_value from public.application_setting_audit where setting_name = 'email_batch_size' order by id desc limit 1),
  '5',
  'batch audit stores previous value'
);
select is(
  (select new_value from public.application_setting_audit where setting_name = 'email_batch_size' order by id desc limit 1),
  '1',
  'batch audit stores new value'
);
select is(
  (select changed_by::text from public.application_setting_audit where setting_name = 'email_batch_size' order by id desc limit 1),
  '20000000-0000-4000-8000-000000000001',
  'batch audit stores acting admin'
);
select ok(
  (select changed_at <= now() from public.application_setting_audit where setting_name = 'email_batch_size' order by id desc limit 1),
  'batch audit stores timestamp'
);
select is(public.set_runtime_email_batch_size(50, false), 50, 'maximum runtime batch size works');
select is((select email_batch_size from public.application_settings where singleton), 50, 'maximum value is stored');
select throws_ok(
  $$select public.set_runtime_email_batch_size(0, false)$$,
  '22023',
  'email batch size must be between 1 and 50',
  'zero is rejected'
);
select throws_ok(
  $$select public.set_runtime_email_batch_size(51, false)$$,
  '22023',
  'email batch size must be between 1 and 50',
  'value above maximum is rejected'
);

select is(public.set_runtime_email_batch_size(1, false), 1, 'batch size can be reduced before Live mode');
select is(public.set_runtime_email_mode('live')::text, 'live', 'delivery mode enters Live for confirmation checks');
select throws_ok(
  $$select public.set_runtime_email_batch_size(10, false)$$,
  '22023',
  'live batch-size increase requires confirmation',
  'substantial Live increase is rejected without confirmation'
);
select is((select email_batch_size from public.application_settings where singleton), 1, 'rejected Live increase leaves value unchanged');
select is(public.set_runtime_email_batch_size(10, true), 10, 'confirmed substantial Live increase works');
select results_eq(
  $$select previous_value, new_value from public.application_setting_audit where setting_name = 'email_batch_size' order by id desc limit 1$$,
  $$values ('1'::text, '10'::text)$$,
  'confirmed Live increase records previous and new batch sizes'
);

select * from finish();
rollback;
