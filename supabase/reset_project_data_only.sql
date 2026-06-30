-- Reset project data only.
-- Run this file in Supabase SQL Editor only when you intentionally want a clean project/research state.
-- This script DOES NOT delete auth.users, profiles, user accounts, user roles, or login records.
-- It deletes project-related records and clears only project/group references from profiles.
-- Note: database rows for uploaded project files are removed; Supabase Storage objects may need manual cleanup if required.

begin;

-- Project document metadata linked to projects or weekly reports only.
do $$
begin
  if to_regclass('public.uploaded_files') is not null then
    delete from public.uploaded_files where project_id is not null or report_id is not null;
  end if;
end $$;

-- Project-related notifications only.
do $$
begin
  if to_regclass('public.notifications') is not null then
    delete from public.notifications
    where project_id is not null
       or weekly_report_id is not null
       or related_deadline_id is not null
       or notification_type ilike '%group_join%'
       or notification_type ilike '%weekly_report%'
       or type in ('Research Group Request', 'Weekly Report');
  end if;
end $$;

-- Final evaluations connected to projects.
do $$
begin
  if to_regclass('public.evaluations') is not null then
    delete from public.evaluations;
  end if;
end $$;

-- Research group requests and official group memberships.
do $$
begin
  if to_regclass('public.research_group_members') is not null then
    delete from public.research_group_members;
  end if;
  if to_regclass('public.group_join_requests') is not null then
    delete from public.group_join_requests;
  end if;
end $$;

-- Weekly reports connected to projects.
do $$
begin
  if to_regclass('public.weekly_reports') is not null then
    delete from public.weekly_reports;
  end if;
end $$;

-- Research/project deadlines in this app. This does not touch user accounts.
do $$
begin
  if to_regclass('public.deadlines') is not null then
    delete from public.deadlines;
  end if;
end $$;

-- Research projects/titles/groups.
do $$
begin
  if to_regclass('public.research_projects') is not null then
    delete from public.research_projects;
  end if;
end $$;

-- Clear only project/group references from profiles. Keep the profile rows, roles, status, names, emails, and login accounts.
do $$
begin
  if to_regclass('public.profiles') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'current_research_group_id') then
      update public.profiles set current_research_group_id = null;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'current_research_group_name') then
      update public.profiles set current_research_group_name = null;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'group_id') then
      update public.profiles set group_id = null;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'project_id') then
      update public.profiles set project_id = null;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'research_title_id') then
      update public.profiles set research_title_id = null;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'research_group_id') then
      update public.profiles set research_group_id = null;
    end if;
  end if;
end $$;

commit;
