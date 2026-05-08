-- PharmaTrack Registration Fix
-- Run this in Supabase SQL Editor if the app cannot register users.
-- It allows the prototype login page to create/read profiles using the anon key.
-- For official university deployment, replace these with stricter Supabase Auth policies.

alter table public.profiles enable row level security;

-- Recreate profile policies safely.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_authenticated" on public.profiles;
drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "profiles_select_anon" on public.profiles;
drop policy if exists "profiles_insert_anon" on public.profiles;
drop policy if exists "profiles_update_anon" on public.profiles;

create policy "profiles_select_anon"
on public.profiles
for select
to anon, authenticated
using (true);

create policy "profiles_insert_anon"
on public.profiles
for insert
to anon, authenticated
with check (true);

create policy "profiles_update_anon"
on public.profiles
for update
to anon, authenticated
using (true)
with check (true);

-- Make sure required columns exist for older databases.
alter table public.profiles add column if not exists status text default 'Active';
alter table public.profiles add column if not exists created_at timestamptz default now();
