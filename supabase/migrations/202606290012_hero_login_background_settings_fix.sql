-- Global website, hero, and login-page settings.
-- Run this file in Supabase SQL Editor. It is safe to run multiple times.
-- This fixes app_settings RLS, website settings RPC, and Supabase Storage policies for uploaded backgrounds.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;

-- Robust admin check for app_settings and storage policies.
-- Supports projects where profiles.id differs from auth.uid(), email-based profiles,
-- and role values stored in auth metadata.
create or replace function public.is_app_settings_admin()
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
      ))) as email,
      lower(trim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''))) as app_role,
      lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''))) as user_role
  )
  select exists (
    select 1
    from auth_context ac
    where ac.uid is not null
      and (
        ac.app_role in ('admin', 'administrator', 'admin/editor')
        or ac.user_role in ('admin', 'administrator', 'admin/editor')
        or exists (
          select 1
          from public.profiles p
          where lower(trim(coalesce(p.role, ''))) in ('admin', 'administrator', 'admin/editor')
            and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') not in ('rejected', 'disabled', 'inactive', 'blocked', 'suspended')
            and (
              p.id = ac.uid
              or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
            )
        )
      )
  );
$$;

grant execute on function public.is_app_settings_admin() to anon, authenticated;

-- Backward-compatible alias used by older PDF customization SQL.
create or replace function public.is_pdf_customization_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select public.is_app_settings_admin();
$$;

grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

-- Replace all existing app_settings policies with one clean, non-conflicting set.
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
  with check (public.is_app_settings_admin());

create policy "app_settings_update_admin_only"
  on public.app_settings
  for update
  to authenticated
  using (public.is_app_settings_admin())
  with check (public.is_app_settings_admin());

create policy "app_settings_delete_admin_only"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_app_settings_admin());

-- Remove older overloaded versions so PostgREST has one exact function signature to find.
drop function if exists public.save_website_settings(jsonb);
drop function if exists public.save_website_settings(jsonb, text);

create or replace function public.save_website_settings(next_value jsonb, updated_by_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save website settings.';
  end if;

  if not public.is_app_settings_admin() then
    raise exception 'Only approved Admin accounts can edit website settings.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'website',
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

grant execute on function public.save_website_settings(jsonb, text) to authenticated;

-- Keep PDF report customization save function compatible if this SQL is run after PDF settings SQL.
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

  if not public.is_app_settings_admin() then
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

-- Public bucket for website/background/logo assets used by the frontend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'app_assets_public_read',
        'app_assets_admin_insert',
        'app_assets_admin_update',
        'app_assets_admin_delete'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "app_assets_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'app-assets');

create policy "app_assets_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'app-assets' and public.is_app_settings_admin());

create policy "app_assets_admin_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'app-assets' and public.is_app_settings_admin())
  with check (bucket_id = 'app-assets' and public.is_app_settings_admin());

create policy "app_assets_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'app-assets' and public.is_app_settings_admin());

-- Default website settings row. Existing customized keys are preserved.
insert into public.app_settings (key, value, updated_by, updated_at)
values (
  'website',
  jsonb_build_object(
    'siteName', 'Pharmacy Research Platform',
    'adminPanelName', 'Pharmacy Research Platform Control Center',
    'homepageHeadline', 'A web-based Pharmacy Research Project Management System',
    'homepageSubtitle', 'For 5th-year students at Hawler Medical University, College of Pharmacy.',
    'heroImage', '/hero-page.png',
    'loginHeroImage', '/hero-page.png',
    'loginBackgroundImage', '/hero-page.png',
    'loginLogoImage', '',
    'loginWelcomeTitle', 'Welcome to Research Platform',
    'loginWelcomeSubtitle', 'Publish your groundbreaking research and connect with scholars worldwide.',
    'loginFeatureOne', 'Open Access Publishing',
    'loginFeatureTwo', 'Peer Review Excellence',
    'loginFeatureThree', 'Global Research Community',
    'loginWelcomeTitleFontSize', 70,
    'loginWelcomeTitleColor', '#ffffff',
    'loginWelcomeTitleFontFamily', '''Inter'', system-ui, -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif',
    'loginWelcomeTitleBold', true,
    'loginWelcomeTitleItalic', false,
    'loginDescriptionFontSize', 19,
    'loginDescriptionColor', '#ffffff',
    'loginDescriptionFontFamily', '''Inter'', system-ui, -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif',
    'loginDescriptionBold', false,
    'loginDescriptionItalic', false,
    'loginFeatureFontSize', 18,
    'loginFeatureColor', '#ffffff',
    'loginFeatureFontFamily', '''Inter'', system-ui, -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif',
    'loginFeatureBold', true,
    'loginFeatureItalic', false,
    'loginGradientStart', '#dbeafe',
    'loginGradientEnd', '#bfdbfe',
    'loginCircleColor', '#ffffff',
    'loginShowGradientOverlay', true,
    'loginShowCircles', true,
    'adminWelcome', 'Manage website content, user access, deadlines, projects, database status, and audit activity from one admin control panel.',
    'maintenanceNotice', '',
    'assetUpdatedAt', ''
  ),
  'system',
  now()
)
on conflict (key) do update set
  value = excluded.value || public.app_settings.value,
  updated_at = now();

notify pgrst, 'reload schema';
