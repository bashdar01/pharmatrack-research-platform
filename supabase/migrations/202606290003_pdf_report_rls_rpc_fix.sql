-- PDF Report Customization complete RLS/RPC fix.
-- Run this file in Supabase SQL Editor.
-- Safe to run multiple times.
-- It keeps RLS enabled, allows everyone to read saved PDF template settings,
-- and allows only authenticated approved Admin users to insert/update PDF settings.

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

-- Server-side Admin check used by app_settings policies, storage policies, and the save RPC.
-- Robust for this project: profiles.id may be different from auth.uid(),
-- some older admin rows may have NULL/blank status, and JWT email can differ by source.
-- Admin permission is still verified against public.profiles, not localStorage.
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

-- Replace all app_settings policies with one clean set.
-- This prevents old/non-admin write policies from staying active.
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

-- Secure backend save endpoint used by the frontend.
-- It performs one stable-key upsert and bypasses direct frontend RLS insert problems,
-- while still verifying Admin permission inside the database.
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
    raise exception 'Your Supabase login is not linked to an Active Admin profile. Please run the updated PDF SQL, refresh, then log out/in with the approved Admin email if needed.';
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

-- Default PDF report customization row.
-- Existing custom values are preserved; missing default keys are added.
insert into public.app_settings (key, value, updated_by, updated_at)
values (
  'pdf_report',
  jsonb_build_object(
    'logoUrl', '',
    'logoPath', '',
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
  ),
  'system',
  now()
)
on conflict (key) do update set
  value = excluded.value || public.app_settings.value,
  updated_at = now();

-- Reuse/create the existing public app-assets bucket for PDF report logos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
  allowed_mime_types = (
    select array_agg(distinct t.mime_type)
    from unnest(coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || excluded.allowed_mime_types) as t(mime_type)
  );

-- PDF logo storage policies.
drop policy if exists "Public can view PDF report logos" on storage.objects;
create policy "Public can view PDF report logos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'app-assets' and (storage.foldername(name))[1] = 'pdf-reports');

drop policy if exists "Admins can upload PDF report logos" on storage.objects;
create policy "Admins can upload PDF report logos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

drop policy if exists "Admins can update PDF report logos" on storage.objects;
create policy "Admins can update PDF report logos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  )
  with check (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

drop policy if exists "Admins can delete PDF report logos" on storage.objects;
create policy "Admins can delete PDF report logos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

notify pgrst, 'reload schema';
