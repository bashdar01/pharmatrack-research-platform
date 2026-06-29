-- Assignment/project email + admin.domain Users & Roles support
-- Run once in Supabase SQL Editor after deploying the updated website.

create extension if not exists "uuid-ossp";

alter table public.research_projects add column if not exists acceptance_email_sent_at timestamptz;
alter table public.research_projects add column if not exists acceptance_email_sent_by uuid references public.profiles(id) on delete set null;
alter table public.research_projects add column if not exists updated_at timestamptz;

alter table public.weekly_reports alter column department drop not null;

-- Helper used by admin-only RPC actions. Security definer avoids profile-policy recursion.
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

-- Allow admins to run the assignment RPC and still keep normal app policies intact.
drop policy if exists "profiles_update_admin_assignment" on public.profiles;
create policy "profiles_update_admin_assignment"
on public.profiles
for update
to authenticated
using (public.current_admin_profile_id() is not null)
with check (public.current_admin_profile_id() is not null);

drop policy if exists "projects_update_admin_assignment" on public.research_projects;
create policy "projects_update_admin_assignment"
on public.research_projects
for update
to authenticated
using (public.current_admin_profile_id() is not null)
with check (public.current_admin_profile_id() is not null);
