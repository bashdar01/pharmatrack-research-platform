-- Admin-only delete controls for accounts, research groups, and research titles/projects.
-- Run once in Supabase SQL Editor.

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

create or replace function public.admin_delete_profile(target_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  target_role text;
  target_email text;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;

  if target_profile_id = admin_id then
    raise exception 'You cannot delete your own admin account while logged in.';
  end if;

  select role, email into target_role, target_email
  from public.profiles
  where id = target_profile_id;

  if target_role is null then
    raise exception 'Account not found.';
  end if;

  if target_role = 'admin' then
    raise exception 'Admin accounts cannot be deleted from this panel.';
  end if;

  update public.research_projects
  set student_id = null,
      student_email = case when lower(coalesce(student_email, '')) = lower(coalesce(target_email, '')) then null else student_email end,
      students = array_remove(coalesce(students, array[]::text[]), (select full_name from public.profiles where id = target_profile_id))
  where student_id = target_profile_id
     or lower(coalesce(student_email, '')) = lower(coalesce(target_email, ''));

  update public.research_projects
  set supervisor_id = null,
      supervisor_email = case when lower(coalesce(supervisor_email, '')) = lower(coalesce(target_email, '')) then null else supervisor_email end,
      supervisor_name = case when supervisor_id = target_profile_id or lower(coalesce(supervisor_email, '')) = lower(coalesce(target_email, '')) then 'Pending Assignment' else supervisor_name end
  where supervisor_id = target_profile_id
     or lower(coalesce(supervisor_email, '')) = lower(coalesce(target_email, ''));

  delete from public.profiles where id = target_profile_id;
  return true;
end;
$$;

grant execute on function public.admin_delete_profile(uuid) to authenticated;

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

  delete from public.uploaded_files
  where project_id = target_project_id
     or report_id in (select id from public.weekly_reports where project_id = target_project_id);

  delete from public.notifications
  where project_id = target_project_id
     or weekly_report_id in (select id from public.weekly_reports where project_id = target_project_id);

  delete from public.evaluations where project_id = target_project_id;
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
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;

  delete from public.uploaded_files
  where project_id in (select id from public.research_projects where group_name = target_group_name)
     or report_id in (
       select wr.id
       from public.weekly_reports wr
       join public.research_projects rp on rp.id = wr.project_id
       where rp.group_name = target_group_name
     );

  delete from public.notifications
  where project_id in (select id from public.research_projects where group_name = target_group_name)
     or weekly_report_id in (
       select wr.id
       from public.weekly_reports wr
       join public.research_projects rp on rp.id = wr.project_id
       where rp.group_name = target_group_name
     );

  delete from public.evaluations
  where project_id in (select id from public.research_projects where group_name = target_group_name);

  delete from public.research_projects where group_name = target_group_name;
  return true;
end;
$$;

grant execute on function public.admin_delete_research_group(text) to authenticated;

-- Harden direct table deletes so students/supervisors cannot bypass the UI.
drop policy if exists "profiles_delete_admin_only" on public.profiles;
drop policy if exists "projects_delete_authenticated" on public.research_projects;
drop policy if exists "projects_delete_admin_only" on public.research_projects;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;
drop policy if exists "uploaded_files_delete_admin_only" on public.uploaded_files;

alter table public.profiles enable row level security;
alter table public.research_projects enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.uploaded_files enable row level security;

create policy "profiles_delete_admin_only"
on public.profiles
for delete
to authenticated
using (
  public.current_admin_profile_id() is not null
  and role <> 'admin'
);

create policy "projects_delete_admin_only"
on public.research_projects
for delete
to authenticated
using (public.current_admin_profile_id() is not null);

create policy "weekly_reports_delete_admin_only"
on public.weekly_reports
for delete
to authenticated
using (public.current_admin_profile_id() is not null);

create policy "uploaded_files_delete_admin_only"
on public.uploaded_files
for delete
to authenticated
using (public.current_admin_profile_id() is not null);
