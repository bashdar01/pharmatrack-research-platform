-- Fix: make Login Page Settings visible on the normal/public website before login.
-- Run this once in Supabase SQL Editor.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

-- Remove the old authenticated-only read policy if it exists.
drop policy if exists "Authenticated users can read app settings" on public.app_settings;
drop policy if exists "Public can read app settings" on public.app_settings;

-- The login page is shown before sign-in, so anonymous visitors must be able to read branding settings.
create policy "Public can read app settings"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
