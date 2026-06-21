-- Global website settings for the Admin Control Center.
-- Run this once in Supabase SQL Editor.
-- After running it, the Admin Panel can save homepage text, hero image URL, login hero image URL, and admin labels globally.

create extension if not exists pgcrypto;

create table if not exists public.website_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value text,
  setting_type text default 'text',
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.website_settings enable row level security;

-- Public website and authenticated users can read website settings.
drop policy if exists "Anyone can read website settings" on public.website_settings;
create policy "Anyone can read website settings"
on public.website_settings
for select
using (true);

-- Approved Admin/Editor users can insert settings.
drop policy if exists "Admins can insert website settings" on public.website_settings;
create policy "Admins can insert website settings"
on public.website_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
      and lower(coalesce(p.role, '')) in ('admin', 'editor')
      and lower(coalesce(p.status, 'pending')) = 'active'
  )
);

-- Approved Admin/Editor users can update settings.
drop policy if exists "Admins can update website settings" on public.website_settings;
create policy "Admins can update website settings"
on public.website_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
      and lower(coalesce(p.role, '')) in ('admin', 'editor')
      and lower(coalesce(p.status, 'pending')) = 'active'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
      and lower(coalesce(p.role, '')) in ('admin', 'editor')
      and lower(coalesce(p.status, 'pending')) = 'active'
  )
);

-- Approved Admin/Editor users can delete settings if needed.
drop policy if exists "Admins can delete website settings" on public.website_settings;
create policy "Admins can delete website settings"
on public.website_settings
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
      and lower(coalesce(p.role, '')) in ('admin', 'editor')
      and lower(coalesce(p.status, 'pending')) = 'active'
  )
);

insert into public.website_settings (setting_key, setting_value, setting_type, description)
values
  ('website_name', 'PharmaTrack Research Platform', 'text', 'Main public website name'),
  ('admin_panel_name', 'PharmaTrack Control Center', 'text', 'Admin panel title'),
  ('homepage_headline', 'A web-based Pharmacy Research Project Management System', 'text', 'Homepage headline text'),
  ('homepage_subtitle', 'For 5th-year students at Hawler Medical University, College of Pharmacy.', 'text', 'Homepage subtitle text'),
  ('hero_image_url', '/hero-page.png', 'image', 'Homepage hero image URL or data URL'),
  ('login_hero_image_url', '/hero-page.png', 'image', 'Login page hero image URL or data URL'),
  ('admin_welcome', 'Manage website content, user access, invitations, deadlines, database tools, and audit activity from one clean admin panel.', 'text', 'Admin welcome text'),
  ('maintenance_notice', '', 'text', 'Optional maintenance or announcement text')
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  setting_type = excluded.setting_type,
  description = excluded.description,
  updated_at = now();
