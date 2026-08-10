begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

insert into auth.users(id,email,raw_app_meta_data) values
('31000000-0000-4000-8000-000000000001','admin@example.com','{"role":"admin"}'::jsonb);
insert into public.sender_accounts(id,display_name,status) values
('31000000-0000-4000-8000-000000000010','Account 3','PENDING');
insert into public.sender_invites(id,expires_at,created_by,sender_label,sender_account_id) values
('31000000-0000-4000-8000-000000000020',now()+interval '1 day','31000000-0000-4000-8000-000000000001','Account 3','31000000-0000-4000-8000-000000000010');
insert into private.sender_invite_tokens(sender_invite_id,token_hash) values
('31000000-0000-4000-8000-000000000020',repeat('a',64));

set local role authenticated;
set local request.jwt.claims='{}';
select throws_ok(
  $$select public.create_or_reinvite_sender('Account 3',repeat('b',64),now()+interval '1 day','31000000-0000-4000-8000-000000000030','31000000-0000-4000-8000-000000000010')$$,
  '42501','admin access required','unauthorized user cannot re-invite sender'
);

set local request.jwt.claims='{"sub":"31000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
select lives_ok(
  $$select public.create_or_reinvite_sender('Account 3',repeat('b',64),now()+interval '1 day','31000000-0000-4000-8000-000000000030','31000000-0000-4000-8000-000000000010')$$,
  'pending sender can be re-invited'
);
select is((select count(*)::integer from public.sender_accounts where display_name='Account 3'),1,'re-invite does not create another sender');
select is((select count(*)::integer from public.sender_invites where sender_account_id='31000000-0000-4000-8000-000000000010'),2,'re-invite creates child invitation history');
select is((select count(*)::integer from public.sender_invites where sender_account_id='31000000-0000-4000-8000-000000000010' and used_at is null and invalidated_at is null),1,'only one current invite exists');
select ok((select invalidated_at is not null from public.sender_invites where id='31000000-0000-4000-8000-000000000020'),'previous invite is invalidated');

select lives_ok(
  $$select public.create_or_reinvite_sender('Account 3',repeat('c',64),now()+interval '1 day','31000000-0000-4000-8000-000000000031','31000000-0000-4000-8000-000000000010')$$,
  'second re-invite still reuses same sender'
);
select is((select count(*)::integer from public.sender_accounts where display_name='Account 3'),1,'repeated re-invite preserves one logical sender');
select is((select count(*)::integer from public.sender_invites where sender_account_id='31000000-0000-4000-8000-000000000010' and used_at is null and invalidated_at is null),1,'repeated re-invite leaves one usable invitation');

select lives_ok(
  $$select public.create_or_reinvite_sender('New Account',repeat('d',64),now()+interval '1 day','31000000-0000-4000-8000-000000000040',null)$$,
  'new logical sender can be created'
);
select lives_ok(
  $$select public.create_or_reinvite_sender('New Account',repeat('e',64),now()+interval '1 day','31000000-0000-4000-8000-000000000040',null)$$,
  'repeated creation request is idempotent at sender level'
);
select is((select count(*)::integer from public.sender_accounts where invite_creation_key='31000000-0000-4000-8000-000000000040'),1,'same request key cannot create duplicate logical senders');

reset role;
select is((select count(*)::integer from public.get_sender_invite_for_connection(repeat('a',64))),0,'superseded invite URL is unusable');
select is((select count(*)::integer from public.get_sender_invite_for_connection(repeat('c',64))),1,'newest invite remains usable');

select * from finish();
rollback;
