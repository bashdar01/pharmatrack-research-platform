-- Single-college staff guardrails for the multi-college Research Platform.
-- Purpose: supervisors and Research Committee users must belong to one college only,
-- and supervisor assignments/projects must not silently cross colleges.
-- Safe to run after the multi-college migration. Does not delete or recreate data.

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.prevent_cross_college_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_profile record;
  normalized_role text := lower(coalesce(new.role, ''));
begin
  if new.college_id is null then
    raise exception 'College is required for every user profile.';
  end if;

  -- One email/account must not be active in two colleges. This prevents the same
  -- supervisor or Research Committee account from being approved in two college workspaces.
  if new.email is not null and btrim(new.email) <> '' then
    select id, full_name, email, role, college_id
      into matching_profile
    from public.profiles
    where lower(email) = lower(new.email)
      and id <> new.id
      and coalesce(status, 'Active') <> 'Rejected'
      and college_id is not null
      and college_id <> new.college_id
    limit 1;

    if found then
      raise exception 'This email is already connected to another college. A user account, including supervisors and Research Committee members, can belong to one college only.';
    end if;
  end if;

  -- If this profile is directly assigned to a supervisor, the supervisor must be in the same college.
  if public.safe_uuid(to_jsonb(new) ->> 'assigned_supervisor_id') is not null then
    if exists (
      select 1
      from public.profiles supervisor
      where supervisor.id = public.safe_uuid(to_jsonb(new) ->> 'assigned_supervisor_id')
        and lower(coalesce(supervisor.role, '')) = 'supervisor'
        and supervisor.college_id <> new.college_id
    ) then
      raise exception 'The assigned supervisor belongs to a different college.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_cross_college_staff_profile on public.profiles;
create trigger profiles_prevent_cross_college_staff_profile
before insert or update of email, role, status, college_id, assigned_supervisor_id
on public.profiles
for each row
execute function public.prevent_cross_college_staff_profile();

create or replace function public.validate_project_supervisor_college()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_college uuid;
  supervisor_uuid uuid;
  creator_uuid uuid;
begin
  project_college := coalesce(new.college_id, public.infer_record_college_id(to_jsonb(new)));
  if project_college is null then
    raise exception 'Project college could not be resolved.';
  end if;

  new.college_id := project_college;
  supervisor_uuid := public.safe_uuid(to_jsonb(new) ->> 'supervisor_id');
  creator_uuid := public.safe_uuid(to_jsonb(new) ->> 'created_by');

  if supervisor_uuid is not null and exists (
    select 1 from public.profiles supervisor
    where supervisor.id = supervisor_uuid
      and lower(coalesce(supervisor.role, '')) = 'supervisor'
      and supervisor.college_id <> project_college
  ) then
    raise exception 'The selected supervisor belongs to a different college than this research project.';
  end if;

  if creator_uuid is not null and exists (
    select 1 from public.profiles creator
    where creator.id = creator_uuid
      and creator.college_id <> project_college
      and lower(coalesce(creator.role, '')) <> 'admin'
  ) then
    raise exception 'The project creator belongs to a different college than this research project.';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.research_projects') is not null then
    drop trigger if exists research_projects_validate_project_supervisor_college on public.research_projects;
    create trigger research_projects_validate_project_supervisor_college
    before insert or update of college_id, supervisor_id, created_by
    on public.research_projects
    for each row
    execute function public.validate_project_supervisor_college();
  end if;
end;
$$;

-- Helpful diagnostic queries after running this migration:
-- 1) Check active duplicate emails across colleges:
-- select lower(email) as email, count(distinct college_id) as college_count
-- from public.profiles
-- where email is not null and coalesce(status, 'Active') <> 'Rejected'
-- group by lower(email)
-- having count(distinct college_id) > 1;
--
-- 2) Check cross-college project supervisors:
-- select rp.id, rp.title, rp.college_id as project_college_id, p.college_id as supervisor_college_id
-- from public.research_projects rp
-- join public.profiles p on p.id = rp.supervisor_id
-- where rp.supervisor_id is not null and rp.college_id <> p.college_id;
