-- PharmaTrack Password Login Notes
-- Passwords are NOT stored in public.profiles.
-- Password registration/login is handled by Supabase Auth.
-- Make sure Supabase Authentication > Providers > Email is enabled.
-- If email confirmation is enabled, new users may need to confirm their email before normal login.
-- For testing, you may disable email confirmation in Supabase Dashboard > Authentication > Providers > Email.

-- This keeps the existing profile table compatible with password-auth users.
alter table public.profiles add column if not exists status text default 'Active';
alter table public.profiles add column if not exists created_at timestamptz default now();
