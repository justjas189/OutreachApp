alter table public.application_settings
  add column email_batch_size integer not null default 5,
  add constraint application_settings_email_batch_size_range
    check (email_batch_size between 1 and 50);

alter table public.application_setting_audit
  drop constraint application_setting_audit_name,
  drop constraint application_setting_audit_previous_mode,
  drop constraint application_setting_audit_new_mode;

alter table public.application_setting_audit
  add constraint application_setting_audit_name
    check (setting_name in ('delivery_mode', 'email_batch_size')),
  add constraint application_setting_audit_previous_value
    check (
      (setting_name = 'delivery_mode' and previous_value in ('preview', 'draft', 'live'))
      or
      (setting_name = 'email_batch_size' and previous_value ~ '^([1-9]|[1-4][0-9]|50)$')
    ),
  add constraint application_setting_audit_new_value
    check (
      (setting_name = 'delivery_mode' and new_value in ('preview', 'draft', 'live'))
      or
      (setting_name = 'email_batch_size' and new_value ~ '^([1-9]|[1-4][0-9]|50)$')
    );

create function public.set_runtime_email_batch_size(
  p_batch_size integer,
  p_live_change_confirmed boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous integer;
  v_mode public.runtime_email_mode;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_batch_size is null or p_batch_size not between 1 and 50 then
    raise exception 'email batch size must be between 1 and 50' using errcode = '22023';
  end if;

  select email_batch_size, delivery_mode
  into v_previous, v_mode
  from public.application_settings
  where singleton
  for update;

  if v_previous is null then
    raise exception 'runtime batch-size setting is unavailable' using errcode = 'P0002';
  end if;

  if v_mode = 'live'
    and p_batch_size >= v_previous + 5
    and not coalesce(p_live_change_confirmed, false)
  then
    raise exception 'live batch-size increase requires confirmation' using errcode = '22023';
  end if;

  if v_previous = p_batch_size then
    return v_previous;
  end if;

  update public.application_settings
  set email_batch_size = p_batch_size,
      updated_by = auth.uid(),
      updated_at = now()
  where singleton;

  insert into public.application_setting_audit (
    setting_name,
    previous_value,
    new_value,
    changed_by
  ) values (
    'email_batch_size',
    v_previous::text,
    p_batch_size::text,
    auth.uid()
  );

  return p_batch_size;
end;
$$;

revoke all on function public.set_runtime_email_batch_size(integer, boolean)
from public, anon, authenticated;
grant execute on function public.set_runtime_email_batch_size(integer, boolean)
to authenticated;

comment on column public.application_settings.email_batch_size is
  'Maximum eligible queue items claimed per connected sender during one worker execution. Runtime range: 1-50.';
comment on function public.set_runtime_email_batch_size(integer, boolean) is
  'Admin-only audited runtime batch-size update. Live increases of five or more require explicit confirmation.';
