-- Role-based Print/PDF report permissions and assigned-student lookup.
-- Run this file in Supabase SQL Editor.
-- Safe to run multiple times.
-- Keeps RLS/security intact and adds backend permission checks used by the existing Print/PDF button.

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  with auth_context as (
    select
      auth.uid() as uid,
      lower(trim(coalesce(
        auth.jwt() ->> 'email',
        (select au.email from auth.users au where au.id = auth.uid()),
        ''
      ))) as email
  )
  select p.id
  from public.profiles p
  cross join auth_context ac
  where coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') in ('active', 'approved')
    and (
      (ac.uid is not null and p.id = ac.uid)
      or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
    )
  limit 1;
$$;

create or replace function public.current_profile_email()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select lower(trim(coalesce(
    (select p.email from public.profiles p where p.id = public.current_profile_id()),
    auth.jwt() ->> 'email',
    (select au.email from auth.users au where au.id = auth.uid()),
    ''
  )));
$$;

create or replace function public.current_profile_full_name()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce((select p.full_name from public.profiles p where p.id = public.current_profile_id()), '');
$$;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select lower(trim(coalesce((select p.role from public.profiles p where p.id = public.current_profile_id()), '')));
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_email() to authenticated;
grant execute on function public.current_profile_full_name() to authenticated;
grant execute on function public.current_profile_role() to authenticated;

create or replace function public.project_assigned_to_current_supervisor(project_row public.research_projects)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(public.current_profile_role(), '') = 'supervisor'
    and (
      project_row.supervisor_id = public.current_profile_id()
      or lower(trim(coalesce(project_row.supervisor_email, ''))) = public.current_profile_email()
      or lower(trim(coalesce(project_row.supervisor_name, ''))) = lower(trim(public.current_profile_full_name()))
    );
$$;

grant execute on function public.project_assigned_to_current_supervisor(public.research_projects) to authenticated;

create or replace function public.can_generate_pdf_report(
  target_student_id uuid default null,
  target_student_email text default null,
  target_supervisor_id uuid default null,
  target_supervisor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  requester_id uuid := public.current_profile_id();
  requester_email text := public.current_profile_email();
  requester_role text := public.current_profile_role();
  requester_name text := lower(trim(public.current_profile_full_name()));
  normalized_student_email text := lower(trim(coalesce(target_student_email, '')));
  normalized_supervisor_email text := lower(trim(coalesce(target_supervisor_email, '')));
begin
  if auth.uid() is null or requester_id is null then
    return false;
  end if;

  if requester_role in ('admin', 'committee', 'admin/editor') then
    return true;
  end if;

  if requester_role = 'student' then
    return (
      (target_student_id is null and normalized_student_email = '')
      or target_student_id = requester_id
      or normalized_student_email = requester_email
    );
  end if;

  if requester_role = 'supervisor' then
    if target_supervisor_id is not null and target_supervisor_id <> requester_id then
      return false;
    end if;
    if normalized_supervisor_email <> '' and normalized_supervisor_email <> requester_email then
      return false;
    end if;

    -- All assigned students report is allowed for the logged-in supervisor only.
    if target_student_id is null and normalized_student_email = '' then
      return true;
    end if;

    return exists (
      select 1
      from public.research_projects rp
      where (
        rp.supervisor_id = requester_id
        or lower(trim(coalesce(rp.supervisor_email, ''))) = requester_email
        or lower(trim(coalesce(rp.supervisor_name, ''))) = requester_name
      )
      and (
        rp.student_id = target_student_id
        or rp.created_by = target_student_id
        or lower(trim(coalesce(rp.student_email, ''))) = normalized_student_email
        or lower(trim(coalesce(rp.created_by_email, ''))) = normalized_student_email
        or exists (
          select 1
          from public.weekly_reports wr
          where wr.project_id = rp.id
            and (
              wr.student_id = target_student_id
              or wr.submitted_by_id = target_student_id
              or wr.user_id = target_student_id
              or lower(trim(coalesce(wr.student_email, wr.submitted_by_email, wr.created_by_email, ''))) = normalized_student_email
            )
        )
      )
    );
  end if;

  return false;
end;
$$;

grant execute on function public.can_generate_pdf_report(uuid, text, uuid, text) to authenticated;

create or replace function public.get_pdf_report_students_for_supervisor(
  target_supervisor_id uuid default null,
  target_supervisor_email text default null
)
returns table (
  student_id uuid,
  student_name text,
  student_email text,
  supervisor_id uuid,
  supervisor_name text,
  supervisor_email text,
  research_group text,
  research_title text
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  requester_id uuid := public.current_profile_id();
  requester_email text := public.current_profile_email();
  requester_role text := public.current_profile_role();
  normalized_supervisor_email text := lower(trim(coalesce(target_supervisor_email, '')));
begin
  if auth.uid() is null or requester_id is null then
    raise exception 'You do not have permission to generate this report.';
  end if;

  if requester_role = 'supervisor' then
    if target_supervisor_id is not null and target_supervisor_id <> requester_id then
      raise exception 'You do not have permission to generate this report.';
    end if;
    if normalized_supervisor_email <> '' and normalized_supervisor_email <> requester_email then
      raise exception 'You do not have permission to generate this report.';
    end if;
    target_supervisor_id := requester_id;
    target_supervisor_email := requester_email;
  elsif requester_role not in ('admin', 'committee', 'admin/editor') then
    raise exception 'You do not have permission to generate this report.';
  end if;

  return query
  select distinct
    coalesce(sp.id, rp.student_id, rp.created_by) as student_id,
    coalesce(sp.full_name, nullif(rp.group_name, ''), 'Student') as student_name,
    coalesce(sp.email, rp.student_email, rp.created_by_email, '') as student_email,
    rp.supervisor_id,
    coalesce(sup.full_name, rp.supervisor_name, 'Supervisor') as supervisor_name,
    coalesce(sup.email, rp.supervisor_email, '') as supervisor_email,
    rp.group_name as research_group,
    rp.title as research_title
  from public.research_projects rp
  left join public.profiles sp
    on sp.id = rp.student_id
    or lower(trim(sp.email)) = lower(trim(coalesce(rp.student_email, rp.created_by_email, '')))
  left join public.profiles sup
    on sup.id = rp.supervisor_id
    or lower(trim(sup.email)) = lower(trim(coalesce(rp.supervisor_email, '')))
  where (
    target_supervisor_id is null
    or rp.supervisor_id = target_supervisor_id
  )
  and (
    coalesce(target_supervisor_email, '') = ''
    or lower(trim(coalesce(rp.supervisor_email, sup.email, ''))) = lower(trim(target_supervisor_email))
  )
  and (
    requester_role in ('admin', 'committee', 'admin/editor')
    or (
      rp.supervisor_id = requester_id
      or lower(trim(coalesce(rp.supervisor_email, ''))) = requester_email
      or lower(trim(coalesce(rp.supervisor_name, ''))) = lower(trim(public.current_profile_full_name()))
    )
  )
  order by student_name, research_group, research_title;
end;
$$;

grant execute on function public.get_pdf_report_students_for_supervisor(uuid, text) to authenticated;
