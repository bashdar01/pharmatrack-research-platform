-- Fix stuck/legacy deadlines that cannot be removed from the supervisor dashboard.
-- Run once in Supabase SQL Editor.

-- Safe helper functions. These use the logged-in email and avoid profile-policy recursion.
create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.role::text
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.current_profile_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.email::text
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.current_profile_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name::text
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

grant execute on function public.current_profile_id() to anon, authenticated;
grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.current_profile_email() to anon, authenticated;
grant execute on function public.current_profile_name() to anon, authenticated;

-- Ensure columns used by newer targeted deadlines exist.
alter table public.deadlines add column if not exists target_student_ids uuid[] default array[]::uuid[];
alter table public.deadlines add column if not exists target_student_emails text[] default array[]::text[];
alter table public.deadlines add column if not exists target_student_names text[] default array[]::text[];
alter table public.deadlines add column if not exists target_student_keys text[] default array[]::text[];
alter table public.deadlines add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.deadlines add column if not exists supervisor_email text;
alter table public.deadlines add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.deadlines add column if not exists created_by_email text;

-- Function used by the app when normal RLS delete blocks an old/legacy deadline.
-- Admin can remove any deadline.
-- Supervisor can remove deadlines they created/own, or old unowned legacy deadlines with no student targets.
create or replace function public.remove_deadline_safe(deadline_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text := public.current_profile_role();
  current_id uuid := public.current_profile_id();
  current_email text := lower(coalesce(public.current_profile_email(), ''));
  target_deadline public.deadlines%rowtype;
  is_owner boolean := false;
  is_legacy_unowned boolean := false;
begin
  select * into target_deadline
  from public.deadlines
  where id = deadline_id_input;

  if not found then
    raise exception 'Deadline not found.';
  end if;

  is_owner := (
    target_deadline.created_by = current_id
    or target_deadline.supervisor_id = current_id
    or lower(coalesce(target_deadline.created_by_email, '')) = current_email
    or lower(coalesce(target_deadline.supervisor_email, '')) = current_email
  );

  is_legacy_unowned := (
    target_deadline.created_by is null
    and target_deadline.supervisor_id is null
    and coalesce(target_deadline.created_by_email, '') = ''
    and coalesce(target_deadline.supervisor_email, '') = ''
    and coalesce(array_length(target_deadline.target_student_ids, 1), 0) = 0
    and coalesce(array_length(target_deadline.target_student_emails, 1), 0) = 0
    and coalesce(array_length(target_deadline.target_student_names, 1), 0) = 0
    and coalesce(array_length(target_deadline.target_student_keys, 1), 0) = 0
  );

  if current_role = 'admin' or (current_role = 'supervisor' and (is_owner or is_legacy_unowned)) then
    delete from public.notifications where related_deadline_id = deadline_id_input;
    delete from public.deadlines where id = deadline_id_input;
    return;
  end if;

  raise exception 'You do not have permission to remove this deadline.';
end;
$$;

grant execute on function public.remove_deadline_safe(uuid) to authenticated;

-- Also update the normal RLS delete policy so old unowned legacy deadlines can be removed by supervisors.
alter table public.deadlines enable row level security;

drop policy if exists "deadlines_delete_owner_admin" on public.deadlines;

create policy "deadlines_delete_owner_admin"
on public.deadlines
for delete
to anon, authenticated
using (
  public.current_profile_role() = 'admin'
  or created_by = public.current_profile_id()
  or supervisor_id = public.current_profile_id()
  or lower(coalesce(created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  or lower(coalesce(supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  or (
    public.current_profile_role() = 'supervisor'
    and created_by is null
    and supervisor_id is null
    and coalesce(created_by_email, '') = ''
    and coalesce(supervisor_email, '') = ''
    and coalesce(array_length(target_student_ids, 1), 0) = 0
    and coalesce(array_length(target_student_emails, 1), 0) = 0
    and coalesce(array_length(target_student_names, 1), 0) = 0
    and coalesce(array_length(target_student_keys, 1), 0) = 0
  )
);
