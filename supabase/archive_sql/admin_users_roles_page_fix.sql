-- Admin Users & Roles page fix
-- Supports admin.domain.com Users & Roles actions with security-definer RPCs.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.profiles add column if not exists status text default 'Pending';
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;
alter table public.research_projects add column if not exists updated_at timestamptz;

create or replace function public.current_admin_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
    and p.role = 'admin'
  limit 1;
$$;

grant execute on function public.current_admin_profile_id() to authenticated;

create or replace function public.admin_update_profile(
  target_profile_id uuid,
  profile_updates jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  updated_profile public.profiles%rowtype;
  next_role text;
  next_status text;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to access this admin feature.';
  end if;

  if target_profile_id is null then
    raise exception 'Target profile id is required.';
  end if;

  if target_profile_id = admin_id and (profile_updates ? 'role' or profile_updates ? 'status') then
    raise exception 'For safety, the active admin cannot change their own role or approval status while logged in.';
  end if;

  next_role := nullif(profile_updates ->> 'role', '');
  if next_role is not null and next_role not in ('student', 'supervisor', 'committee', 'admin') then
    raise exception 'Invalid role: %', next_role;
  end if;

  next_status := nullif(profile_updates ->> 'status', '');
  if next_status is not null and next_status not in ('Pending', 'Active', 'Rejected') then
    raise exception 'Invalid status: %', next_status;
  end if;

  update public.profiles
  set role = coalesce(next_role, role),
      status = coalesce(next_status, status),
      department = case when profile_updates ? 'department' then nullif(profile_updates ->> 'department', '') else department end,
      assigned_supervisor_id = case
        when profile_updates ? 'assigned_supervisor_id' then nullif(profile_updates ->> 'assigned_supervisor_id', '')::uuid
        else assigned_supervisor_id
      end,
      assigned_supervisor_email = case when profile_updates ? 'assigned_supervisor_email' then coalesce(profile_updates ->> 'assigned_supervisor_email', '') else assigned_supervisor_email end,
      assigned_supervisor_name = case when profile_updates ? 'assigned_supervisor_name' then coalesce(profile_updates ->> 'assigned_supervisor_name', '') else assigned_supervisor_name end
  where id = target_profile_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'User account not found.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_update_profile(uuid, jsonb) to authenticated;

-- Drop the old function first because PostgreSQL cannot change a function return type with CREATE OR REPLACE.
drop function if exists public.admin_assign_student_to_supervisor(uuid, uuid);

create or replace function public.admin_assign_student_to_supervisor(
  target_student_id uuid,
  target_supervisor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  student_record public.profiles%rowtype;
  supervisor_record public.profiles%rowtype;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to access this admin feature.';
  end if;

  select * into student_record
  from public.profiles
  where id = target_student_id and role = 'student';

  if student_record.id is null then
    raise exception 'Student account not found.';
  end if;

  if target_supervisor_id is not null then
    select * into supervisor_record
    from public.profiles
    where id = target_supervisor_id and role = 'supervisor';

    if supervisor_record.id is null then
      raise exception 'Supervisor account not found.';
    end if;
  end if;

  update public.profiles
  set assigned_supervisor_id = supervisor_record.id,
      assigned_supervisor_email = coalesce(supervisor_record.email, ''),
      assigned_supervisor_name = coalesce(supervisor_record.full_name, '')
  where id = student_record.id;

  update public.research_projects
  set supervisor_id = supervisor_record.id,
      supervisor_email = coalesce(supervisor_record.email, ''),
      supervisor_name = coalesce(supervisor_record.full_name, 'Pending Assignment'),
      updated_at = now()
  where student_id = student_record.id
     or created_by = student_record.id
     or lower(coalesce(student_email, '')) = lower(coalesce(student_record.email, ''))
     or lower(coalesce(created_by_email, '')) = lower(coalesce(student_record.email, ''))
     or lower(coalesce(group_name, '')) = lower(coalesce(student_record.full_name, ''))
     or lower(coalesce(student_record.full_name, '')) = any(select lower(unnest(coalesce(students, array[]::text[]))));

  return true;
end;
$$;

grant execute on function public.admin_assign_student_to_supervisor(uuid, uuid) to authenticated;

-- Direct update fallback for older client actions while still requiring an approved admin.
drop policy if exists "profiles_update_admin_users_roles" on public.profiles;
create policy "profiles_update_admin_users_roles"
on public.profiles
for update
to authenticated
using (public.current_admin_profile_id() is not null)
with check (public.current_admin_profile_id() is not null);
