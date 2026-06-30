-- Project/title deletion and project-data-only reset backend helpers
-- Safe to run multiple times.

alter table public.profiles add column if not exists current_research_group_id uuid references public.research_projects(id) on delete set null;
alter table public.profiles add column if not exists current_research_group_name text;

create or replace function public.admin_delete_research_project(target_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;

  if not exists (select 1 from public.research_projects where id = target_project_id) then
    raise exception 'Research title not found.';
  end if;

  -- Remove project-linked file metadata. Storage objects are removed by the app before this RPC when available.
  delete from public.uploaded_files
  where project_id = target_project_id
     or report_id in (select id from public.weekly_reports where project_id = target_project_id);

  -- Remove in-app notifications linked to this project or its weekly reports.
  delete from public.notifications
  where project_id = target_project_id
     or weekly_report_id in (select id from public.weekly_reports where project_id = target_project_id)
     or notification_type ilike ('%group_join%') and project_id = target_project_id;

  -- Remove project-specific evaluation/report/join/group-member data.
  delete from public.evaluations where project_id = target_project_id;
  delete from public.research_group_members where group_id = target_project_id or project_id = target_project_id;
  delete from public.group_join_requests where requested_group_id = target_project_id or current_group_id = target_project_id;
  delete from public.weekly_reports where project_id = target_project_id;

  -- Remove optional deadline links if the deployed database has project-specific deadline columns.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'project_id') then
    execute 'delete from public.deadlines where project_id = $1' using target_project_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'research_project_id') then
    execute 'delete from public.deadlines where research_project_id = $1' using target_project_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'target_project_id') then
    execute 'delete from public.deadlines where target_project_id = $1' using target_project_id;
  end if;

  -- Clear only project/group references from profiles. Do not delete users or roles.
  update public.profiles
  set current_research_group_id = null,
      current_research_group_name = null
  where current_research_group_id = target_project_id;

  delete from public.research_projects where id = target_project_id;
  return true;
end;
$$;

grant execute on function public.admin_delete_research_project(uuid) to authenticated;

create or replace function public.admin_delete_research_group(target_group_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  project_ids uuid[];
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into project_ids
  from public.research_projects
  where group_name = target_group_name;

  if array_length(project_ids, 1) is null then
    raise exception 'Research group not found.';
  end if;

  delete from public.uploaded_files
  where project_id = any(project_ids)
     or report_id in (select id from public.weekly_reports where project_id = any(project_ids));

  delete from public.notifications
  where project_id = any(project_ids)
     or weekly_report_id in (select id from public.weekly_reports where project_id = any(project_ids))
     or (notification_type ilike '%group_join%' and project_id = any(project_ids));

  delete from public.evaluations where project_id = any(project_ids);
  delete from public.research_group_members where group_id = any(project_ids) or project_id = any(project_ids);
  delete from public.group_join_requests where requested_group_id = any(project_ids) or current_group_id = any(project_ids) or requested_group_name = target_group_name;
  delete from public.weekly_reports where project_id = any(project_ids);

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'project_id') then
    execute 'delete from public.deadlines where project_id = any($1)' using project_ids;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'research_project_id') then
    execute 'delete from public.deadlines where research_project_id = any($1)' using project_ids;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deadlines' and column_name = 'target_project_id') then
    execute 'delete from public.deadlines where target_project_id = any($1)' using project_ids;
  end if;

  update public.profiles
  set current_research_group_id = null,
      current_research_group_name = null
  where current_research_group_id = any(project_ids)
     or current_research_group_name = target_group_name;

  delete from public.research_projects where id = any(project_ids);
  return true;
end;
$$;

grant execute on function public.admin_delete_research_group(text) to authenticated;

create or replace function public.admin_reset_project_data_only()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;

  -- Delete only project-related records. Users/profiles/auth records are not deleted.
  delete from public.uploaded_files where project_id is not null or report_id is not null;
  delete from public.notifications
  where project_id is not null
     or weekly_report_id is not null
     or related_deadline_id is not null
     or notification_type ilike '%group_join%'
     or notification_type ilike '%weekly_report%'
     or type in ('Research Group Request', 'Weekly Report');
  delete from public.evaluations;
  delete from public.research_group_members;
  delete from public.group_join_requests;
  delete from public.weekly_reports;
  delete from public.deadlines;
  delete from public.research_projects;

  update public.profiles
  set current_research_group_id = null,
      current_research_group_name = null;

  return true;
end;
$$;

grant execute on function public.admin_reset_project_data_only() to authenticated;
