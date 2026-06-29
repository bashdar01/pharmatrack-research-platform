-- Optional global website settings table for the admin subdomain control panel.
-- Run this in Supabase SQL Editor if you want hero image/text settings to save globally for all users.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

-- Public login/home pages must be able to read website settings before the user signs in.
-- This allows both anonymous visitors and signed-in users to read the public branding/login settings.
drop policy if exists "Authenticated users can read app settings" on public.app_settings;
drop policy if exists "Public can read app settings" on public.app_settings;
create policy "Public can read app settings"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- Approved Admin accounts can insert/update/delete website settings.
drop policy if exists "Approved admins can insert app settings" on public.app_settings;
create policy "Approved admins can insert app settings"
  on public.app_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.role = 'admin'
        and coalesce(p.status, 'Pending') = 'Active'
    )
  );

drop policy if exists "Approved admins can update app settings" on public.app_settings;
create policy "Approved admins can update app settings"
  on public.app_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.role = 'admin'
        and coalesce(p.status, 'Pending') = 'Active'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.role = 'admin'
        and coalesce(p.status, 'Pending') = 'Active'
    )
  );

drop policy if exists "Approved admins can delete app settings" on public.app_settings;
create policy "Approved admins can delete app settings"
  on public.app_settings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.role = 'admin'
        and coalesce(p.status, 'Pending') = 'Active'
    )
  );

insert into public.app_settings (key, value, updated_by)
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
    'loginGradientStart', '#1d4ed8',
    'loginGradientEnd', '#2563eb',
    'loginCircleColor', '#ffffff',
    'loginShowGradientOverlay', true,
    'loginShowCircles', true,
    'adminWelcome', 'Manage website content, user access, deadlines, projects, database status, and audit activity from one admin control panel.',
    'maintenanceNotice', ''
  ),
  'system'
)
on conflict (key) do update set
  value = excluded.value || public.app_settings.value,
  updated_at = now();

notify pgrst, 'reload schema';
