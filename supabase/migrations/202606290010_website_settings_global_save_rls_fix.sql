-- Global website/login-page settings for the admin subdomain control panel.
-- Run this file in Supabase SQL Editor. It is safe to run multiple times.
-- It fixes app_settings RLS and adds a secure admin-only RPC used by the frontend.

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

-- Robust admin check for app_settings.
-- This supports projects where profiles.id is different from auth.uid(),
-- checks the logged-in email, and accepts Active/Approved admin rows.
create or replace function public.is_app_settings_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  -- Robust admin check for this project.
  -- profiles.id may not equal auth.uid(), so email matching is included.
  -- Status is intentionally permissive for legacy admin rows: only clearly blocked/rejected statuses are denied.
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
    where lower(trim(coalesce(p.role, ''))) in ('admin', 'admin/editor', 'administrator')
      and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') not in ('rejected', 'disabled', 'inactive', 'blocked', 'suspended')
      and (
        (ac.uid is not null and p.id = ac.uid)
        or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
      )
  );
$$;

grant execute on function public.is_app_settings_admin() to anon, authenticated;

-- Backward-compatible alias for existing PDF customization SQL/functions.
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

-- Public login/home pages need to read website settings before sign-in.
create policy "app_settings_read_global"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- Only approved admins can create/update/delete settings.
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

-- Secure backend save endpoint for website/login customization.
-- The frontend uses this instead of direct app_settings.upsert(), avoiding RLS insert errors.
create or replace function public.save_website_settings(next_value jsonb, updated_by_value text default null)
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

-- Compatibility overload for projects/clients that call the RPC with only next_value.
create or replace function public.save_website_settings(next_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.save_website_settings(next_value, null);
end;
$$;

grant execute on function public.save_website_settings(jsonb) to authenticated;


-- Keep the PDF report save function available if this file is run after PDF settings SQL.
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

-- Default website settings row. Existing customized keys are preserved.
insert into public.app_settings (key, value, updated_by, updated_at)
values (
  'website',
  jsonb_build_object(
    'siteName', 'PharmaTrack Research Platform',
    'adminPanelName', 'PharmaTrack Control Center',
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
    'maintenanceNotice', ''
  ),
  'system',
  now()
)
on conflict (key) do update set
  value = excluded.value || public.app_settings.value,
  updated_at = now();

notify pgrst, 'reload schema';
