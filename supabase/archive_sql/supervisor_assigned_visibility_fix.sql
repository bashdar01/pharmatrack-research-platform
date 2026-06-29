-- Supervisor assigned-student visibility fix
-- Run once in Supabase SQL Editor.
-- This prevents supervisors from viewing/reviewing weekly reports or progress records
-- that belong to students who are not assigned to them.

create or replace function public.current_profile_id()
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
  limit 1;
$$;

create or replace function public.current_profile_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.email
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

create or replace function public.current_profile_full_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
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
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

create or replace function public.current_user_is_project_supervisor(
  project_supervisor_id uuid,
  project_supervisor_email text,
  project_supervisor_name text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    project_supervisor_id = public.current_profile_id()
    or lower(coalesce(project_supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    or lower(coalesce(project_supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), '')),
    false
  );
$$;

create or replace function public.report_matches_project_student(
  report_student_id uuid,
  report_submitted_by_id uuid,
  report_user_id uuid,
  report_created_by uuid,
  report_student_email text,
  report_submitted_by_email text,
  report_created_by_email text,
  report_submitted_by text,
  project_student_id uuid,
  project_created_by uuid,
  project_student_email text,
  project_created_by_email text,
  project_students text[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      project_student_id is not null and (
        report_student_id = project_student_id
        or report_submitted_by_id = project_student_id
        or report_user_id = project_student_id
        or report_created_by = project_student_id
      )
    )
    or (
      project_created_by is not null and (
        report_student_id = project_created_by
        or report_submitted_by_id = project_created_by
        or report_user_id = project_created_by
        or report_created_by = project_created_by
      )
    )
    or (
      nullif(lower(coalesce(project_student_email, '')), '') is not null and (
        lower(coalesce(report_student_email, '')) = lower(project_student_email)
        or lower(coalesce(report_submitted_by_email, '')) = lower(project_student_email)
        or lower(coalesce(report_created_by_email, '')) = lower(project_student_email)
      )
    )
    or (
      nullif(lower(coalesce(project_created_by_email, '')), '') is not null and (
        lower(coalesce(report_student_email, '')) = lower(project_created_by_email)
        or lower(coalesce(report_submitted_by_email, '')) = lower(project_created_by_email)
        or lower(coalesce(report_created_by_email, '')) = lower(project_created_by_email)
      )
    )
    or (
      nullif(lower(coalesce(report_submitted_by, '')), '') is not null
      and lower(report_submitted_by) in (
        select lower(unnest(coalesce(project_students, array[]::text[])))
      )
    ),
    false
  );
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_email() to authenticated;
grant execute on function public.current_profile_full_name() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_user_is_project_supervisor(uuid, text, text) to authenticated;
grant execute on function public.report_matches_project_student(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, text, text[]) to authenticated;

alter table public.research_projects enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.uploaded_files enable row level security;

-- Research/project progress visibility: supervisor sees only assigned projects; admin/committee see all; students see own.
drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_select_role_scoped" on public.research_projects;

create policy "projects_select_role_scoped"
on public.research_projects
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'student'
    and (
      research_projects.student_id = public.current_profile_id()
      or research_projects.created_by = public.current_profile_id()
      or lower(coalesce(research_projects.student_email, research_projects.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(public.current_profile_full_name(), '')) = any(select lower(unnest(coalesce(research_projects.students, array[]::text[]))))
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
  )
);

-- Weekly report visibility/update: supervisor sees/reviews only reports from assigned students on assigned projects.
drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;
drop policy if exists "weekly_reports_update_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_update_supervisor_or_admin" on public.weekly_reports;

create policy "weekly_reports_select_role_scoped"
on public.weekly_reports
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'student'
    and (
      weekly_reports.submitted_by_id = public.current_profile_id()
      or weekly_reports.student_id = public.current_profile_id()
      or weekly_reports.user_id = public.current_profile_id()
      or weekly_reports.created_by = public.current_profile_id()
      or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, weekly_reports.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
        and public.report_matches_project_student(
          weekly_reports.student_id,
          weekly_reports.submitted_by_id,
          weekly_reports.user_id,
          weekly_reports.created_by,
          weekly_reports.student_email,
          weekly_reports.submitted_by_email,
          weekly_reports.created_by_email,
          weekly_reports.submitted_by,
          rp.student_id,
          rp.created_by,
          rp.student_email,
          rp.created_by_email,
          rp.students
        )
    )
  )
);

create policy "weekly_reports_update_supervisor_or_admin"
on public.weekly_reports
for update
to authenticated
using (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
        and public.report_matches_project_student(
          weekly_reports.student_id,
          weekly_reports.submitted_by_id,
          weekly_reports.user_id,
          weekly_reports.created_by,
          weekly_reports.student_email,
          weekly_reports.submitted_by_email,
          weekly_reports.created_by_email,
          weekly_reports.submitted_by,
          rp.student_id,
          rp.created_by,
          rp.student_email,
          rp.created_by_email,
          rp.students
        )
    )
  )
)
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
        and public.report_matches_project_student(
          weekly_reports.student_id,
          weekly_reports.submitted_by_id,
          weekly_reports.user_id,
          weekly_reports.created_by,
          weekly_reports.student_email,
          weekly_reports.submitted_by_email,
          weekly_reports.created_by_email,
          weekly_reports.submitted_by,
          rp.student_id,
          rp.created_by,
          rp.student_email,
          rp.created_by_email,
          rp.students
        )
    )
  )
);

-- Attachment visibility follows the same report/project assignment rules.
drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_select_role_scoped" on public.uploaded_files;

create policy "uploaded_files_select_role_scoped"
on public.uploaded_files
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'student'
    and (
      uploaded_files.uploaded_by = public.current_profile_id()
      or uploaded_files.user_id = public.current_profile_id()
      or uploaded_files.created_by = public.current_profile_id()
      or lower(coalesce(uploaded_files.uploaded_by_email, uploaded_files.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or exists (
        select 1 from public.weekly_reports wr
        where wr.id = uploaded_files.report_id
          and (
            wr.student_id = public.current_profile_id()
            or wr.submitted_by_id = public.current_profile_id()
            or wr.user_id = public.current_profile_id()
            or lower(coalesce(wr.student_email, wr.submitted_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          )
      )
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.weekly_reports wr
      join public.research_projects rp on rp.id = wr.project_id
      where wr.id = uploaded_files.report_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
        and public.report_matches_project_student(
          wr.student_id,
          wr.submitted_by_id,
          wr.user_id,
          wr.created_by,
          wr.student_email,
          wr.submitted_by_email,
          wr.created_by_email,
          wr.submitted_by,
          rp.student_id,
          rp.created_by,
          rp.student_email,
          rp.created_by_email,
          rp.students
        )
    )
  )
);
