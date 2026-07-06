-- project_member_report_visibility_fix.sql
-- Fixes project member visibility for progress, weekly reports, supervisor feedback, and attachments.
-- Does NOT change weekly report submission permissions.
-- Does NOT change auth/users/roles.

begin;

-- ------------------------------------------------------------
-- Helper: normalize role aliases used by different app versions.
-- ------------------------------------------------------------
create or replace function public.current_profile_role_normalized()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_profile_role() in ('committee', 'research_committee') then 'committee'
    else public.current_profile_role()
  end;
$$;

grant execute on function public.current_profile_role_normalized() to authenticated;

-- ------------------------------------------------------------
-- Helper: check whether the current signed-in student is an active
-- member of the target research project/group.
-- ------------------------------------------------------------
create or replace function public.current_user_is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = public.current_profile_id()
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'student'
        and (
          exists (
            select 1
            from public.research_group_members rgm
            where lower(coalesce(rgm.status, 'Active')) not in ('removed', 'rejected', 'inactive')
              and (
                rgm.group_id = target_project_id
                or rgm.project_id = target_project_id
              )
              and (
                rgm.student_id = p.id
                or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
              )
          )
          or exists (
            select 1
            from public.research_projects rp
            where rp.id = target_project_id
              and (
                rp.student_id = p.id
                or rp.created_by = p.id
                or lower(coalesce(rp.student_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(rp.created_by_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(p.email, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
                or lower(coalesce(p.full_name, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
              )
          )
        )
    ),
    false
  );
$$;

grant execute on function public.current_user_is_project_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- research_group_members visibility:
-- Students need to read membership rows for their own group/project so
-- the frontend can identify project members and show shared reports.
-- ------------------------------------------------------------
alter table public.research_group_members enable row level security;

drop policy if exists "research_group_members_select_authenticated" on public.research_group_members;
drop policy if exists "research_group_members_select_role_scoped" on public.research_group_members;
drop policy if exists "research_group_members_select_member_project" on public.research_group_members;

create policy "research_group_members_select_member_project"
on public.research_group_members
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      -- own membership row
      student_id = public.current_profile_id()
      or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      -- other rows in a group/project where current student is also a member
      or public.current_user_is_project_member(coalesce(project_id, group_id))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = coalesce(research_group_members.project_id, research_group_members.group_id)
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
    )
  )
);

-- ------------------------------------------------------------
-- Projects/progress visibility:
-- A student can SELECT a project if they are a member of it.
-- ------------------------------------------------------------
alter table public.research_projects enable row level security;

drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_select_role_scoped" on public.research_projects;
drop policy if exists "research_projects_select_member_visible" on public.research_projects;

create policy "research_projects_select_member_visible"
on public.research_projects
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(research_projects.id)
      or research_projects.student_id = public.current_profile_id()
      or research_projects.created_by = public.current_profile_id()
      or lower(coalesce(research_projects.student_email, research_projects.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(public.current_profile_full_name(), '')) = any(select lower(unnest(coalesce(research_projects.students, array[]::text[]))))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
  )
);

-- ------------------------------------------------------------
-- Weekly report visibility:
-- Project members can SELECT all weekly reports for their own project.
-- Inserts/updates remain controlled by existing submit/review logic.
-- ------------------------------------------------------------
alter table public.weekly_reports enable row level security;

drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;
drop policy if exists "weekly_reports_select_member_visible" on public.weekly_reports;

create policy "weekly_reports_select_member_visible"
on public.weekly_reports
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(weekly_reports.project_id)
      or weekly_reports.submitted_by_id = public.current_profile_id()
      or weekly_reports.student_id = public.current_profile_id()
      or weekly_reports.user_id = public.current_profile_id()
      or weekly_reports.created_by = public.current_profile_id()
      or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, weekly_reports.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
    )
  )
);

-- ------------------------------------------------------------
-- Uploaded file visibility:
-- Project members can SELECT attachments linked to their project's reports.
-- ------------------------------------------------------------
alter table public.uploaded_files enable row level security;

drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_select_role_scoped" on public.uploaded_files;
drop policy if exists "uploaded_files_select_member_visible" on public.uploaded_files;

create policy "uploaded_files_select_member_visible"
on public.uploaded_files
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(uploaded_files.project_id)
      or exists (
        select 1
        from public.weekly_reports wr
        where wr.id = uploaded_files.report_id
          and public.current_user_is_project_member(wr.project_id)
      )
      or uploaded_files.uploaded_by = public.current_profile_id()
      or uploaded_files.user_id = public.current_profile_id()
      or uploaded_files.created_by = public.current_profile_id()
      or lower(coalesce(uploaded_files.uploaded_by_email, uploaded_files.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and (
      exists (
        select 1
        from public.research_projects rp
        where rp.id = uploaded_files.project_id
          and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
      )
      or exists (
        select 1
        from public.weekly_reports wr
        join public.research_projects rp on rp.id = wr.project_id
        where wr.id = uploaded_files.report_id
          and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
      )
    )
  )
);

-- Refresh PostgREST schema cache.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end $$;

commit;
