-- project_member_report_visibility_fix.sql
-- Allows every active member of a project/group to view project progress,
-- weekly reports, supervisor feedback stored on weekly_reports, and report attachments.
-- Keeps weekly report insert/update permissions unchanged.

begin;

-- Helper: current student can read reports/files for projects they belong to.
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
          -- membership table link
          exists (
            select 1
            from public.research_group_members rgm
            where coalesce(rgm.status, 'Active') <> 'Removed'
              and (rgm.group_id = target_project_id or rgm.project_id = target_project_id)
              and (
                rgm.student_id = p.id
                or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
              )
          )
          -- legacy/direct project fields
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

-- Weekly report SELECT: students can read reports for their project/group membership.
-- Insert/update/delete policies are intentionally not changed.
alter table public.weekly_reports enable row level security;

drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;

create policy "weekly_reports_select_role_scoped"
on public.weekly_reports
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee', 'research_committee')
  or (
    public.current_profile_role() = 'student'
    and public.current_user_is_project_member(weekly_reports.project_id)
  )
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
    )
  )
);

-- Attachment SELECT: project members can view report/project attachments for their own project.
-- Insert/update/delete policies are intentionally not changed.
alter table public.uploaded_files enable row level security;

drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_select_role_scoped" on public.uploaded_files;

create policy "uploaded_files_select_role_scoped"
on public.uploaded_files
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee', 'research_committee')
  or (
    public.current_profile_role() = 'student'
    and (
      public.current_user_is_project_member(uploaded_files.project_id)
      or exists (
        select 1
        from public.weekly_reports wr
        where wr.id = uploaded_files.report_id
          and public.current_user_is_project_member(wr.project_id)
      )
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
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

-- Project/progress SELECT: keep project progress visible to members through research_projects.progress.
alter table public.research_projects enable row level security;

drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_select_role_scoped" on public.research_projects;

create policy "projects_select_role_scoped"
on public.research_projects
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee', 'research_committee')
  or (
    public.current_profile_role() = 'student'
    and (
      coalesce(research_projects.approval, '') = 'Approved'
      or public.current_user_is_project_member(research_projects.id)
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
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
