begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

select has_column('public','templates','body_html','templates store rich HTML alongside legacy text');
select has_column('public','email_drafts','body_html','generated drafts store rich HTML alongside plain text');
select has_column('public','campaign_run_recipients','body_html','run snapshots preserve immutable rich HTML');
select col_type_is('public','templates','body_html','text','template HTML uses text storage');
select col_type_is('public','email_drafts','body_html','text','draft HTML uses text storage');
select col_type_is('public','campaign_run_recipients','body_html','text','run HTML uses text storage');
select has_function('public','approve_email_preview',array['uuid','text','text','text'],'approval RPC accepts text and sanitized HTML');

select * from finish();
rollback;
