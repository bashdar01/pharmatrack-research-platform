-- Pharmacy Research Platform - account separation and role-based report visibility fix
-- Run once in Supabase SQL Editor after pulling this update.

alter table public.research_projects add column if not exists supervisor_email text;
alter table public.research_projects add column if not exists student_id uuid references public.profiles(id) on delete set null;
alter table public.research_projects add column if not exists student_email text;
alter table public.research_projects add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.research_projects add column if not exists created_by_email text;

alter table public.weekly_reports add column if not exists student_id uuid references public.profiles(id) on delete set null;
alter table public.weekly_reports add column if not exists student_email text;
alter table public.weekly_reports add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.weekly_reports add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.weekly_reports add column if not exists created_by_email text;

alter table public.uploaded_files add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.uploaded_files add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.uploaded_files add column if not exists created_by_email text;

-- Backfill owner IDs for older rows where possible.
update public.research_projects rp
set student_id = p.id,
    student_email = coalesce(rp.student_email, p.email),
    created_by = coalesce(rp.created_by, p.id),
    created_by_email = coalesce(rp.created_by_email, p.email)
from public.profiles p
where rp.student_id is null
  and (
    lower(coalesce(rp.student_email, '')) = lower(p.email)
    or lower(coalesce(rp.created_by_email, '')) = lower(p.email)
    or lower(coalesce(rp.group_name, '')) = lower(p.full_name)
    or p.full_name = any(rp.students)
  );

update public.weekly_reports wr
set submitted_by_id = coalesce(wr.submitted_by_id, p.id),
    student_id = coalesce(wr.student_id, p.id),
    user_id = coalesce(wr.user_id, p.id),
    created_by = coalesce(wr.created_by, p.id),
    submitted_by_email = coalesce(wr.submitted_by_email, p.email),
    student_email = coalesce(wr.student_email, p.email),
    created_by_email = coalesce(wr.created_by_email, p.email)
from public.profiles p
where (wr.student_id is null or wr.user_id is null or wr.submitted_by_id is null)
  and (
    lower(coalesce(wr.submitted_by_email, '')) = lower(p.email)
    or lower(coalesce(wr.student_email, '')) = lower(p.email)
    or lower(coalesce(wr.submitted_by, '')) = lower(p.full_name)
  );

update public.uploaded_files uf
set user_id = coalesce(uf.user_id, p.id),
    created_by = coalesce(uf.created_by, p.id),
    created_by_email = coalesce(uf.created_by_email, p.email)
from public.profiles p
where (uf.user_id is null or uf.created_by is null)
  and (
    lower(coalesce(uf.uploaded_by_email, '')) = lower(p.email)
    or uf.uploaded_by = p.id
  );

-- Replace broad development policies that allowed every signed-in user to see all student data.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_authenticated" on public.profiles;
drop policy if exists "profiles_update_authenticated" on public.profiles;

drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_insert_authenticated" on public.research_projects;
drop policy if exists "projects_update_authenticated" on public.research_projects;
drop policy if exists "projects_delete_authenticated" on public.research_projects;

drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_update_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;

drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_insert_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_update_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_admin_only" on public.uploaded_files;

drop policy if exists "evaluations_select_authenticated" on public.evaluations;
drop policy if exists "evaluations_insert_authenticated" on public.evaluations;
drop policy if exists "evaluations_update_authenticated" on public.evaluations;

drop policy if exists "deadlines_select_authenticated" on public.deadlines;
drop policy if exists "deadlines_insert_authenticated" on public.deadlines;
drop policy if exists "deadlines_update_authenticated" on public.deadlines;

drop policy if exists "audit_logs_select_authenticated" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;

-- Profiles: users see their own profile; active admins see all. Registration may insert pending profile.
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
);

create policy "profiles_insert_registration" on public.profiles
for insert to anon, authenticated with check (true);

create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
) with check (
  lower(email) = lower(auth.jwt() ->> 'email')
  or exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
);

-- Projects: students see own, supervisors see assigned, committee/admin see all.
create policy "projects_select_role_scoped" on public.research_projects
for select to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role in ('admin','committee')
        or (me.role = 'student' and (research_projects.student_id = me.id or lower(coalesce(research_projects.student_email, '')) = lower(me.email) or research_projects.created_by = me.id or lower(coalesce(research_projects.created_by_email, '')) = lower(me.email)))
        or (me.role = 'supervisor' and (research_projects.supervisor_id = me.id or lower(coalesce(research_projects.supervisor_email, '')) = lower(me.email) or lower(coalesce(research_projects.supervisor_name, '')) = lower(me.full_name)))
      )
  )
);

create policy "projects_insert_own_student_or_admin" on public.research_projects
for insert to authenticated with check (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role in ('admin','committee')
        or (me.role = 'student' and (student_id = me.id or lower(coalesce(student_email, '')) = lower(me.email)))
      )
  )
);

create policy "projects_update_role_scoped" on public.research_projects
for update to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role in ('admin','committee')
        or (me.role = 'supervisor' and (research_projects.supervisor_id = me.id or lower(coalesce(research_projects.supervisor_email, '')) = lower(me.email) or lower(coalesce(research_projects.supervisor_name, '')) = lower(me.full_name)))
        or (me.role = 'student' and (research_projects.student_id = me.id or lower(coalesce(research_projects.student_email, '')) = lower(me.email)))
      )
  )
);

create policy "projects_delete_admin_only" on public.research_projects
for delete to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
);

-- Weekly reports: students can access only their own reports; supervisors can review assigned reports; admins can access all.
create policy "weekly_reports_select_role_scoped" on public.weekly_reports
for select to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role in ('admin','committee')
        or (me.role = 'student' and (weekly_reports.submitted_by_id = me.id or weekly_reports.student_id = me.id or weekly_reports.user_id = me.id or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, '')) = lower(me.email)))
        or (me.role = 'supervisor' and exists (
          select 1 from public.research_projects rp
          where rp.id = weekly_reports.project_id
            and (rp.supervisor_id = me.id or lower(coalesce(rp.supervisor_email, '')) = lower(me.email) or lower(coalesce(rp.supervisor_name, '')) = lower(me.full_name))
        ))
      )
  )
);

create policy "weekly_reports_insert_own_student" on public.weekly_reports
for insert to authenticated with check (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role = 'admin'
        or (me.role = 'student' and (submitted_by_id = me.id or student_id = me.id or user_id = me.id or lower(coalesce(submitted_by_email, student_email, '')) = lower(me.email)))
      )
  )
);

create policy "weekly_reports_update_supervisor_or_admin" on public.weekly_reports
for update to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and exists (
          select 1 from public.research_projects rp
          where rp.id = weekly_reports.project_id
            and (rp.supervisor_id = me.id or lower(coalesce(rp.supervisor_email, '')) = lower(me.email) or lower(coalesce(rp.supervisor_name, '')) = lower(me.full_name))
        ))
      )
  )
);

create policy "weekly_reports_delete_admin_only" on public.weekly_reports
for delete to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
);

-- Uploaded files: visible only through accessible reports/projects; deleting is admin-only.
create policy "uploaded_files_select_role_scoped" on public.uploaded_files
for select to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (
        me.role in ('admin','committee')
        or (me.role = 'student' and (uploaded_files.uploaded_by = me.id or uploaded_files.user_id = me.id or uploaded_files.created_by = me.id or lower(coalesce(uploaded_files.uploaded_by_email, uploaded_files.created_by_email, '')) = lower(me.email)))
        or (me.role = 'supervisor' and exists (
          select 1 from public.research_projects rp
          where rp.id = uploaded_files.project_id
            and (rp.supervisor_id = me.id or lower(coalesce(rp.supervisor_email, '')) = lower(me.email) or lower(coalesce(rp.supervisor_name, '')) = lower(me.full_name))
        ))
      )
  )
);

create policy "uploaded_files_insert_own" on public.uploaded_files
for insert to authenticated with check (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (uploaded_by = me.id or user_id = me.id or created_by = me.id or lower(coalesce(uploaded_by_email, created_by_email, '')) = lower(me.email) or me.role = 'admin')
  )
);

create policy "uploaded_files_update_own_or_admin" on public.uploaded_files
for update to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and (me.role = 'admin' or uploaded_files.uploaded_by = me.id or uploaded_files.user_id = me.id or uploaded_files.created_by = me.id)
  )
);

create policy "uploaded_files_delete_admin_only" on public.uploaded_files
for delete to authenticated using (
  exists (
    select 1 from public.profiles me
    where lower(me.email) = lower(auth.jwt() ->> 'email')
      and coalesce(me.status, 'Pending') = 'Active'
      and me.role = 'admin'
  )
);

-- Shared supporting tables.
create policy "deadlines_select_active_users" on public.deadlines for select to authenticated using (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active')
);
create policy "deadlines_insert_supervisor_admin" on public.deadlines for insert to authenticated with check (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role in ('supervisor','admin'))
);
create policy "deadlines_update_supervisor_admin" on public.deadlines for update to authenticated using (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role in ('supervisor','admin'))
);

create policy "evaluations_select_committee_admin" on public.evaluations for select to authenticated using (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role in ('committee','admin'))
);
create policy "evaluations_insert_committee_admin" on public.evaluations for insert to authenticated with check (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role in ('committee','admin'))
);
create policy "evaluations_update_committee_admin" on public.evaluations for update to authenticated using (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role in ('committee','admin'))
);

create policy "audit_logs_select_admin" on public.audit_logs for select to authenticated using (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active' and me.role = 'admin')
);
create policy "audit_logs_insert_active_users" on public.audit_logs for insert to authenticated with check (
  exists (select 1 from public.profiles me where lower(me.email) = lower(auth.jwt() ->> 'email') and coalesce(me.status, 'Pending') = 'Active')
);

-- Storage files are still addressed by file_path from uploaded_files. The UI and RLS above prevent cross-account record access.
