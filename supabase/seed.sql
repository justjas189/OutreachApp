insert into public.templates (
  business_type,
  guide_title,
  audience,
  services_focus,
  subject_template,
  body_template
) values (
  'Makeup Artists',
  'Best Makeup Artists',
  'brides, wedding parties, and event attendees',
  'bridal makeup, special events, and professional beauty services',
  'Can {{NAME}} Be Featured in {{CITY}}''s {{GUIDE_TITLE}} Guide?',
  'Hi {{NAME}} Team,\n\nThis is safe local demo content. No email is sent by Phases 1–3.\n\nReference: {{LINK}}'
)
on conflict (business_type) do nothing;

do $$
declare
  v_admin_id uuid;
  v_campaign_id uuid;
begin
  select id
  into v_admin_id
  from auth.users
  where raw_app_meta_data ->> 'role' = 'admin'
  order by created_at
  limit 1;

  if v_admin_id is not null
    and not exists (
      select 1 from public.campaigns where name = 'Portland partners — demo'
    )
  then
    insert into public.campaigns (
      name,
      city,
      status,
      google_sheet_id,
      worksheet_name,
      created_by
    ) values (
      'Portland partners — demo',
      'Portland',
      'READY',
      'safe-example-spreadsheet-id',
      'Recipients',
      v_admin_id
    ) returning id into v_campaign_id;

    insert into public.recipients (
      campaign_id,
      name,
      email,
      link,
      business_type
    ) values
      (v_campaign_id, 'Rose City Glam', 'rose.city.glam@example.com', 'https://example.com/rose-city-glam', 'Makeup Artists'),
      (v_campaign_id, 'Northwest Lens', 'northwest.lens@example.com', 'https://example.com/northwest-lens', 'Wedding Photographers'),
      (v_campaign_id, 'Petal & Pine', 'petal.and.pine@example.com', 'https://example.com/petal-and-pine', 'Florists');
  end if;
end;
$$;
