-- Role-specific PDF Report Customization update.
-- Safe to run multiple times in Supabase SQL Editor.
-- Adds per-role PDF settings while keeping the existing global pdf_report row as fallback.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings add column if not exists key text;
alter table public.app_settings add column if not exists value jsonb default '{}'::jsonb;
alter table public.app_settings add column if not exists updated_by text;
alter table public.app_settings add column if not exists updated_at timestamptz default now();

update public.app_settings set value = '{}'::jsonb where value is null;
delete from public.app_settings where key is null;
delete from public.app_settings a
using public.app_settings b
where a.key = b.key
  and a.ctid < b.ctid;

alter table public.app_settings alter column key set not null;
alter table public.app_settings alter column value set not null;
create unique index if not exists app_settings_key_unique on public.app_settings (key);

alter table public.app_settings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;

create or replace function public.is_pdf_customization_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  with auth_context as (
    select
      auth.uid() as uid,
      lower(trim(coalesce(
        auth.jwt() ->> 'email',
        (select au.email from auth.users au where au.id = auth.uid()),
        ''
      ))) as email
  )
  select exists (
    select 1
    from public.profiles p
    cross join auth_context ac
    where lower(trim(coalesce(p.role, ''))) in ('admin', 'admin/editor')
      and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') in ('active', 'approved')
      and (
        (ac.uid is not null and p.id = ac.uid)
        or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
      )
  );
$$;

grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
  loop
    execute format('drop policy if exists %I on public.app_settings', pol.policyname);
  end loop;
end $$;

create policy "app_settings_read_global"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "app_settings_insert_admin_only"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_pdf_customization_admin());

create policy "app_settings_update_admin_only"
  on public.app_settings
  for update
  to authenticated
  using (public.is_pdf_customization_admin())
  with check (public.is_pdf_customization_admin());

create or replace function public.pdf_report_setting_key_for_role(role_value text)
returns text
language sql
immutable
as $$
  select case lower(replace(coalesce(role_value, 'student'), '-', '_'))
    when 'student' then 'pdf_report_customization_student'
    when 'supervisor' then 'pdf_report_customization_supervisor'
    when 'admin' then 'pdf_report_customization_admin'
    when 'committee' then 'pdf_report_customization_research_committee'
    when 'research_committee' then 'pdf_report_customization_research_committee'
    when 'researchcommittee' then 'pdf_report_customization_research_committee'
    else 'pdf_report_customization_student'
  end;
$$;

grant execute on function public.pdf_report_setting_key_for_role(text) to anon, authenticated;

create or replace function public.save_pdf_report_role_settings(
  next_value jsonb,
  role_value text,
  updated_by_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_key text;
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save PDF report settings.';
  end if;

  if not public.is_pdf_customization_admin() then
    raise exception 'Only approved Admin accounts can edit PDF report customization settings.';
  end if;

  target_key := public.pdf_report_setting_key_for_role(role_value);

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    target_key,
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_pdf_report_role_settings(jsonb, text, text) to authenticated;

-- Keep the existing global save function available for backward compatibility.
create or replace function public.save_pdf_report_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save PDF report settings.';
  end if;

  if not public.is_pdf_customization_admin() then
    raise exception 'Only approved Admin accounts can edit PDF report customization settings.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'pdf_report',
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_pdf_report_settings(jsonb, text) to authenticated;

do $$
declare
  default_pdf jsonb := jsonb_build_object(
    'logoUrl', '',
    'logoPath', '',
    'showLogo', true,
    'reportTitle', 'Pharmacy Research Project Management Report',
    'headerText', 'Hawler Medical University – College of Pharmacy',
    'universityName', 'Hawler Medical University',
    'collegeName', 'College of Pharmacy',
    'departmentName', 'Department of Pharmacy',
    'footerText', '',
    'showPageNumbers', true,
    'showGeneratedDateTime', true,
    'sections', jsonb_build_object(
      'userInformation', true,
      'studentInformation', true,
      'supervisorInformation', true,
      'researchGroup', true,
      'researchTitle', true,
      'weeklyReports', true,
      'feedback', true,
      'projectProgress', true,
      'deadlines', true,
      'finalEvaluationRubric', true,
      'signatures', true,
      'generatedDateTime', true
    )
  );
  base_pdf jsonb;
  role_key text;
begin
  select value into base_pdf from public.app_settings where key = 'pdf_report';
  base_pdf := coalesce(base_pdf, default_pdf);

  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('pdf_report', base_pdf, 'system', now())
  on conflict (key) do update set
    value = default_pdf || public.app_settings.value,
    updated_at = now();

  foreach role_key in array array[
    'pdf_report_customization_student',
    'pdf_report_customization_supervisor',
    'pdf_report_customization_admin',
    'pdf_report_customization_research_committee'
  ]
  loop
    insert into public.app_settings (key, value, updated_by, updated_at)
    values (role_key, base_pdf, 'system', now())
    on conflict (key) do update set
      value = default_pdf || public.app_settings.value,
      updated_at = now();
  end loop;
end $$;
