-- Supervisor deadline assigned-student dropdown and backend targeting fix
-- Safe to run multiple times in Supabase SQL Editor.
-- This allows supervisors to create deadlines only for students assigned to them
-- through either research_projects or profiles.assigned_supervisor_*.

create extension if not exists "uuid-ossp";

alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;

alter table public.deadlines add column if not exists description text;
alter table public.deadlines add column if not exists priority text default 'Normal';
alter table public.deadlines add column if not exists target_scope text default 'all';
alter table public.deadlines add column if not exists target_student_ids uuid[] default array[]::uuid[];
alter table public.deadlines add column if not exists target_student_emails text[] default array[]::text[];
alter table public.deadlines add column if not exists target_student_names text[] default array[]::text[];
alter table public.deadlines add column if not exists target_student_keys text[] default array[]::text[];
alter table public.deadlines add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.deadlines add column if not exists supervisor_email text;
alter table public.deadlines add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.deadlines add column if not exists created_by_email text;

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
    and lower(coalesce(p.status, 'active')) in ('active', 'approved')
  limit 1;
$$;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lower(p.role::text)
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and lower(coalesce(p.status, 'active')) in ('active', 'approved')
  limit 1;
$$;

create or replace function public.current_profile_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lower(p.email::text)
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and lower(coalesce(p.status, 'active')) in ('active', 'approved')
  limit 1;
$$;

create or replace function public.current_profile_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lower(p.full_name::text)
  from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and lower(coalesce(p.status, 'active')) in ('active', 'approved')
  limit 1;
$$;

grant execute on function public.current_profile_id() to anon, authenticated;
grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.current_profile_email() to anon, authenticated;
grant execute on function public.current_profile_name() to anon, authenticated;

create or replace function public.supervisor_can_target_deadline_students(
  target_ids uuid[],
  target_emails text[],
  target_names text[],
  target_keys text[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with current_profile as (
    select public.current_profile_id() as id,
           public.current_profile_email() as email,
           public.current_profile_name() as name,
           public.current_profile_role() as role
  ), targets as (
    select unnest(coalesce(target_ids, array[]::uuid[])) as student_id, null::text as student_email, null::text as student_name, null::text as student_key
    union all
    select null::uuid, lower(unnest(coalesce(target_emails, array[]::text[]))), null::text, null::text
    union all
    select null::uuid, null::text, lower(unnest(coalesce(target_names, array[]::text[]))), null::text
    union all
    select null::uuid, null::text, null::text, lower(unnest(coalesce(target_keys, array[]::text[])))
  ), non_empty_targets as (
    select * from targets
    where student_id is not null
       or nullif(student_email, '') is not null
       or nullif(student_name, '') is not null
       or nullif(student_key, '') is not null
  )
  select case
    when (select role from current_profile) = 'admin' then true
    when (select role from current_profile) <> 'supervisor' then false
    when not exists (select 1 from non_empty_targets) then false
    else not exists (
      select 1
      from non_empty_targets t, current_profile cp
      where not (
        exists (
          select 1
          from public.profiles sp
          where sp.role = 'student'
            and (
              sp.assigned_supervisor_id = cp.id
              or lower(coalesce(sp.assigned_supervisor_email, '')) = cp.email
              or lower(coalesce(sp.assigned_supervisor_name, '')) = cp.name
            )
            and (
              (t.student_id is not null and sp.id = t.student_id)
              or (t.student_email is not null and lower(coalesce(sp.email, '')) = t.student_email)
              or (t.student_name is not null and lower(coalesce(sp.full_name, '')) = t.student_name)
              or (t.student_key is not null and (
                t.student_key = concat('id:', sp.id::text)
                or t.student_key = concat('email:', lower(coalesce(sp.email, '')))
                or t.student_key = concat('name:', lower(coalesce(sp.full_name, '')))
              ))
            )
        )
        or exists (
          select 1
          from public.research_projects rp
          where (
            rp.supervisor_id = cp.id
            or lower(coalesce(rp.supervisor_email, '')) = cp.email
            or lower(coalesce(rp.supervisor_name, '')) = cp.name
          )
          and (
            (t.student_id is not null and (rp.student_id = t.student_id or rp.created_by = t.student_id))
            or (t.student_email is not null and (lower(coalesce(rp.student_email, '')) = t.student_email or lower(coalesce(rp.created_by_email, '')) = t.student_email))
            or (t.student_name is not null and (
              lower(coalesce(rp.group_name, '')) = t.student_name
              or t.student_name = any(select lower(x) from unnest(coalesce(rp.students, array[]::text[])) as x)
            ))
            or (t.student_key is not null and (
              t.student_key = concat('id:', rp.student_id::text)
              or t.student_key = concat('id:', rp.created_by::text)
              or t.student_key = concat('email:', lower(coalesce(rp.student_email, '')))
              or t.student_key = concat('email:', lower(coalesce(rp.created_by_email, '')))
              or t.student_key = concat('name:', lower(coalesce(rp.group_name, '')))
              or replace(t.student_key, 'name:', '') = any(select lower(x) from unnest(coalesce(rp.students, array[]::text[])) as x)
            ))
          )
        )
      )
    )
  end;
$$;

grant execute on function public.supervisor_can_target_deadline_students(uuid[], text[], text[], text[]) to anon, authenticated;

alter table public.deadlines enable row level security;

drop policy if exists "deadlines_insert_authenticated" on public.deadlines;
drop policy if exists "deadlines_update_authenticated" on public.deadlines;
drop policy if exists "deadlines_delete_authenticated" on public.deadlines;
drop policy if exists "deadlines_insert_role_based" on public.deadlines;
drop policy if exists "deadlines_update_owner_admin" on public.deadlines;
drop policy if exists "deadlines_delete_owner_admin" on public.deadlines;

create policy "deadlines_insert_role_based"
on public.deadlines
for insert
to anon, authenticated
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and public.supervisor_can_target_deadline_students(target_student_ids, target_student_emails, target_student_names, target_student_keys)
  )
);

create policy "deadlines_update_owner_admin"
on public.deadlines
for update
to anon, authenticated
using (
  public.current_profile_role() = 'admin'
  or created_by = public.current_profile_id()
  or supervisor_id = public.current_profile_id()
  or lower(coalesce(created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  or lower(coalesce(supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
)
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and public.supervisor_can_target_deadline_students(target_student_ids, target_student_emails, target_student_names, target_student_keys)
  )
);

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
);
