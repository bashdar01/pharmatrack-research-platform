-- PharmaTrack Admin Approval Workflow Migration
-- Run this once in Supabase SQL Editor if your database was created before the approval feature.

-- 1) Ensure the profile status column exists.
alter table public.profiles add column if not exists status text;

-- 2) Keep existing users active if they already existed before this update.
update public.profiles
set status = 'Active'
where status is null or trim(status) = '';

-- 3) New users should be Pending by default unless the app explicitly makes the first Admin Active.
alter table public.profiles alter column status set default 'Pending';
alter table public.profiles alter column status set not null;

-- Optional: normalize unexpected values.
update public.profiles
set status = 'Pending'
where status not in ('Pending', 'Active', 'Rejected');
