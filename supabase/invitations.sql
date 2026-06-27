-- PharmaTrack Invitation Management
-- Run this in Supabase SQL Editor after schema.sql and registration_fix.sql.

create extension if not exists pgcrypto;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  role text not null check (role in ('student', 'supervisor', 'committee', 'admin')),
  subject text not null,
  body text not null,
  token text not null unique,
  invitation_link text,
  expires_at timestamptz not null,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Expired', 'Cancelled')),
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists invitations_email_idx on public.invitations (lower(email));
create index if not exists invitations_role_idx on public.invitations (role);
create index if not exists invitations_status_idx on public.invitations (status);
create index if not exists invitations_token_idx on public.invitations (token);

-- Prevent duplicate active pending invitations for the same email and role.
-- Expired invitations should be marked Expired or Cancelled before a new pending invite is created.
create unique index if not exists invitations_unique_pending_email_role_idx
on public.invitations (lower(email), role)
where status = 'Pending';

alter table public.invitations enable row level security;

-- Admins can manage invitations. This policy assumes profiles.email matches auth.email().
drop policy if exists "Admins can manage invitations" on public.invitations;
create policy "Admins can manage invitations"
on public.invitations
for all
using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.email())
      and p.role = 'admin'
      and coalesce(p.status, 'Pending') = 'Active'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.email())
      and p.role = 'admin'
      and coalesce(p.status, 'Pending') = 'Active'
  )
);

-- Allow invited users to read their invitation by token during registration.
-- This is useful for public invitation acceptance pages.
drop policy if exists "Public can read pending invitation by token" on public.invitations;
create policy "Public can read pending invitation by token"
on public.invitations
for select
using (status = 'Pending');

-- Optional helper to expire old pending invitations manually.
create or replace function public.expire_old_invitations()
returns void
language sql
security definer
as $$
  update public.invitations
  set status = 'Expired'
  where status = 'Pending'
    and expires_at < now();
$$;
