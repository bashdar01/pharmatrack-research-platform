-- PDF Report Customization RLS/RPC fix.
-- Run once in Supabase SQL Editor, or deploy with: npx supabase db push
-- This keeps the existing Print/PDF report system and fixes global save failures caused by app_settings RLS.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

-- Robust admin check used by app_settings policies, storage policies, and the save RPC.
-- It supports existing profile rows where the admin profile is matched by email or auth.uid().
create or replace function public.is_pdf_customization_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where lower(coalesce(p.role, '')) = 'admin'
      and lower(coalesce(p.status, 'pending')) in ('active', 'approved')
      and (
        lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or p.id = auth.uid()
      )
  );
$$;

grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

-- All users can read saved report template settings so existing Print/PDF buttons use the global template.
drop policy if exists "Authenticated users can read app settings" on public.app_settings;
drop policy if exists "Public can read app settings" on public.app_settings;
create policy "Public can read app settings"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- Only approved admins can change global app settings.
drop policy if exists "Approved admins can insert app settings" on public.app_settings;
create policy "Approved admins can insert app settings"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_pdf_customization_admin());

drop policy if exists "Approved admins can update app settings" on public.app_settings;
create policy "Approved admins can update app settings"
  on public.app_settings
  for update
  to authenticated
  using (public.is_pdf_customization_admin())
  with check (public.is_pdf_customization_admin());

drop policy if exists "Approved admins can delete app settings" on public.app_settings;
create policy "Approved admins can delete app settings"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_pdf_customization_admin());

-- SECURITY DEFINER save endpoint used by the frontend as the primary global save path.
-- This avoids direct upsert RLS insert failures while still verifying admin permission server-side.
create or replace function public.save_pdf_report_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_value jsonb;
begin
  if not public.is_pdf_customization_admin() then
    raise exception 'Only approved admin accounts can edit PDF report customization settings.';
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

-- Default report settings. Existing customized values are preserved.
insert into public.app_settings (key, value, updated_by)
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
  'system'
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

-- Public read for uploaded PDF report logos.
drop policy if exists "Public can view PDF report logos" on storage.objects;
create policy "Public can view PDF report logos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'app-assets' and (storage.foldername(name))[1] = 'pdf-reports');

-- Admin-only logo writes.
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
