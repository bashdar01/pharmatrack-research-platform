-- PharmaTrack Research Platform
-- Supabase/PostgreSQL database schema
-- Run this file in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text unique not null,
  role text not null check (role in ('student','supervisor','committee','admin')),
  status text not null default 'Pending',
  department text,
  assigned_supervisor_id uuid,
  assigned_supervisor_email text,
  assigned_supervisor_name text,
  assigned_supervisor_email_sent_at timestamptz,
  assigned_supervisor_email_supervisor_id uuid,
  assigned_supervisor_email_supervisor_email text,
  created_at timestamptz default now()
);

create table if not exists public.research_projects (
  id uuid primary key default uuid_generate_v4(),
  group_name text not null,
  title text not null,
  area text not null check (area in ('Clinical Analysis','Clinical Pharmacy','Pharmaceutical Chemistry and Pharmacognosy','Pharmaceutics','Pharmacology')),
  supervisor_name text default 'Pending Assignment',
  supervisor_id uuid references public.profiles(id),
  supervisor_email text,
  student_id uuid references public.profiles(id) on delete set null,
  student_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  approval text default 'Pending Committee Review',
  status text default 'Pending',
  progress numeric(5,2) default 0 check (progress >= 0 and progress <= 100),
  final_due date,
  students text[] default array[]::text[],
  created_at timestamptz default now()
);

create table if not exists public.weekly_reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.research_projects(id) on delete cascade,
  department text check (department is null or department in ('Clinical Analysis','Clinical Pharmacy','Pharmaceutical Chemistry and Pharmacognosy','Pharmaceutics','Pharmacology')),
  week_number integer not null,
  submitted_by text not null,
  submitted_by_id uuid references public.profiles(id) on delete set null,
  submitted_by_email text,
  student_id uuid references public.profiles(id) on delete set null,
  student_email text,
  user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  submitted_at timestamptz default now(),
  completed_work text not null,
  challenges text,
  next_week_plan text,
  attendance text default 'Attended',
  status text default 'Submitted',
  supervisor_feedback text,
  score integer check (score >= 0 and score <= 20)
);

create table if not exists public.uploaded_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.research_projects(id) on delete cascade,
  report_id uuid references public.weekly_reports(id) on delete set null,
  uploaded_by uuid references public.profiles(id),
  uploaded_by_email text,
  user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  file_type text not null,
  file_name text not null,
  file_path text not null,
  file_url text,
  file_mime_type text,
  version_number integer default 1,
  status text default 'Submitted',
  created_at timestamptz default now()
);

create table if not exists public.evaluations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.research_projects(id) on delete cascade,
  evaluator_name text not null,
  evaluation_type text not null default 'Final Evaluation Rubric /50',
  -- New /50 rubric mapping:
  -- attendance_score = Title novelty /10
  -- progress_score = Research contents /10
  -- research_quality_score = Flow of writing and data presentation /10
  -- writing_score = Plagiarism and AI /10
  -- presentation_score = Follow the university guideline /10
  -- teamwork_score is kept for compatibility with old /100 data and is 0 for new /50 evaluations.
  attendance_score integer default 0 check (attendance_score between 0 and 10),
  progress_score integer default 0 check (progress_score between 0 and 10),
  research_quality_score integer default 0 check (research_quality_score between 0 and 10),
  writing_score integer default 0 check (writing_score between 0 and 10),
  presentation_score integer default 0 check (presentation_score between 0 and 10),
  teamwork_score integer default 0 check (teamwork_score between 0 and 10),
  total_score integer generated always as (
    attendance_score + progress_score + research_quality_score + writing_score + presentation_score + teamwork_score
  ) stored,
  max_score integer default 50,
  rubric_version text default 'final_rubric_50_v1',
  comments text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.deadlines (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  deadline_type text not null,
  due_date date not null,
  academic_year text default '2026-2027',
  status text default 'Active',
  priority text default 'Normal',
  target_scope text default 'all',
  target_student_ids uuid[] default array[]::uuid[],
  target_student_emails text[] default array[]::text[],
  target_student_names text[] default array[]::text[],
  target_student_keys text[] default array[]::text[],
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_email text,
  sender_user_id uuid references public.profiles(id) on delete set null,
  weekly_report_id uuid references public.weekly_reports(id) on delete cascade,
  project_id uuid references public.research_projects(id) on delete cascade,
  related_deadline_id uuid references public.deadlines(id) on delete cascade,
  notification_type text,
  title text not null,
  message text not null,
  type text default 'Reminder',
  target_role text default 'all' check (target_role in ('all','student','supervisor','committee','admin')),
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor text not null,
  action text not null,
  entity text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.research_projects enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.evaluations enable row level security;
alter table public.deadlines enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Safe migration for older PharmaTrack databases that had notification_type but not type/target_role.
alter table public.notifications add column if not exists type text default 'Reminder';
alter table public.notifications add column if not exists target_role text default 'all';
alter table public.notifications add column if not exists recipient_user_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists recipient_email text;
alter table public.notifications add column if not exists sender_user_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists weekly_report_id uuid references public.weekly_reports(id) on delete cascade;
alter table public.notifications add column if not exists project_id uuid references public.research_projects(id) on delete cascade;
alter table public.notifications add column if not exists related_deadline_id uuid references public.deadlines(id) on delete cascade;
alter table public.notifications add column if not exists notification_type text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;
alter table public.profiles add column if not exists assigned_supervisor_email_sent_at timestamptz;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_email text;
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
alter table public.weekly_reports alter column department drop not null;

alter table public.uploaded_files add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.uploaded_files add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.uploaded_files add column if not exists created_by_email text;

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

update public.research_projects rp
set student_id = p.id,
    student_email = p.email,
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
set student_id = p.id,
    user_id = p.id,
    created_by = coalesce(wr.created_by, p.id),
    student_email = p.email,
    created_by_email = coalesce(wr.created_by_email, p.email)
from public.profiles p
where (wr.student_id is null or wr.user_id is null)
  and (
    lower(coalesce(wr.submitted_by_email, '')) = lower(p.email)
    or lower(coalesce(wr.student_email, '')) = lower(p.email)
    or lower(coalesce(wr.submitted_by, '')) = lower(p.full_name)
  );

update public.uploaded_files uf
set user_id = p.id,
    created_by = coalesce(uf.created_by, p.id),
    created_by_email = coalesce(uf.created_by_email, p.email)
from public.profiles p
where uf.user_id is null
  and (
    lower(coalesce(uf.uploaded_by_email, '')) = lower(p.email)
    or uf.uploaded_by = p.id
  );


-- Development policies for testing with the built-in demo login. Before official university deployment,
-- replace these with stricter role-based policies using Supabase Auth user IDs.
create policy "profiles_select_authenticated" on public.profiles for select to anon, authenticated using (true);
create policy "profiles_insert_authenticated" on public.profiles for insert to anon, authenticated with check (true);
create policy "profiles_update_authenticated" on public.profiles for update to anon, authenticated using (true);

create policy "projects_select_authenticated" on public.research_projects for select to anon, authenticated using (true);
create policy "projects_insert_authenticated" on public.research_projects for insert to anon, authenticated with check (true);
create policy "projects_update_authenticated" on public.research_projects for update to anon, authenticated using (true);
create policy "projects_delete_authenticated" on public.research_projects for delete to anon, authenticated using (true);

create policy "weekly_reports_select_authenticated" on public.weekly_reports for select to anon, authenticated using (true);
create policy "weekly_reports_insert_authenticated" on public.weekly_reports for insert to anon, authenticated with check (true);
create policy "weekly_reports_update_authenticated" on public.weekly_reports for update to anon, authenticated using (true);
create policy "weekly_reports_delete_admin_only" on public.weekly_reports for delete to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and p.role = 'admin'
  )
);

create policy "uploaded_files_select_authenticated" on public.uploaded_files for select to anon, authenticated using (true);
create policy "uploaded_files_insert_authenticated" on public.uploaded_files for insert to anon, authenticated with check (true);
create policy "uploaded_files_update_authenticated" on public.uploaded_files for update to anon, authenticated using (true);
create policy "uploaded_files_delete_admin_only" on public.uploaded_files for delete to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and p.role = 'admin'
  )
);

create policy "evaluations_select_authenticated" on public.evaluations for select to authenticated using (true);
create policy "evaluations_insert_completed_projects_only" on public.evaluations for insert to authenticated with check (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and p.role in ('admin', 'committee')
  )
  and exists (
    select 1 from public.research_projects rp
    where rp.id = project_id
      and coalesce(rp.progress, 0) >= 100
  )
  and attendance_score between 0 and 10
  and progress_score between 0 and 10
  and research_quality_score between 0 and 10
  and writing_score between 0 and 10
  and presentation_score between 0 and 10
  and teamwork_score between 0 and 10
);
create policy "evaluations_update_completed_projects_only" on public.evaluations for update to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and p.role in ('admin', 'committee')
  )
) with check (
  exists (
    select 1 from public.research_projects rp
    where rp.id = project_id
      and coalesce(rp.progress, 0) >= 100
  )
  and attendance_score between 0 and 10
  and progress_score between 0 and 10
  and research_quality_score between 0 and 10
  and writing_score between 0 and 10
  and presentation_score between 0 and 10
  and teamwork_score between 0 and 10
);

create policy "deadlines_select_authenticated" on public.deadlines for select to anon, authenticated using (true);
create policy "deadlines_insert_authenticated" on public.deadlines for insert to anon, authenticated with check (true);
create policy "deadlines_update_authenticated" on public.deadlines for update to anon, authenticated using (true);

create policy "notifications_select_own_or_admin" on public.notifications
for select to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
        or (notifications.profile_id is null and notifications.recipient_user_id is null and notifications.target_role in ('all', p.role))
      )
  )
);
create policy "notifications_insert_allowed_report_events" on public.notifications
for insert to authenticated with check (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
  )
);
create policy "notifications_update_own_read_status" on public.notifications
for update to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
      )
  )
);

create policy "notifications_delete_own_or_admin" on public.notifications
for delete to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
      )
  )
);

create policy "audit_logs_select_authenticated" on public.audit_logs for select to anon, authenticated using (true);
create policy "audit_logs_insert_authenticated" on public.audit_logs for insert to anon, authenticated with check (true);

-- Create the Storage bucket manually in Supabase Dashboard:
-- Storage > New bucket > Name: project-files > Private bucket.

-- Admin-only delete controls for accounts, research groups, and research titles/projects.
-- If updating an existing database, you can also run supabase/admin_only_delete_controls.sql by itself.
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

drop policy if exists "profiles_delete_admin_only" on public.profiles;
drop policy if exists "projects_delete_authenticated" on public.research_projects;
drop policy if exists "projects_delete_admin_only" on public.research_projects;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;
drop policy if exists "uploaded_files_delete_admin_only" on public.uploaded_files;

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

-- Supervisor weekly report filtering and backend access security
-- Run once in Supabase SQL Editor.

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

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_email() to authenticated;
grant execute on function public.current_profile_full_name() to authenticated;
grant execute on function public.current_profile_role() to authenticated;

alter table public.weekly_reports enable row level security;

-- Remove old broad policies so supervisors cannot fetch unrelated student reports.
drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_own_student" on public.weekly_reports;
drop policy if exists "weekly_reports_update_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_update_supervisor_or_admin" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;

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
      or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
);

create policy "weekly_reports_insert_own_student"
on public.weekly_reports
for insert
to authenticated
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'student'
    and (
      submitted_by_id = public.current_profile_id()
      or student_id = public.current_profile_id()
      or user_id = public.current_profile_id()
      or lower(coalesce(submitted_by_email, student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
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
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
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
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
);

create policy "weekly_reports_delete_admin_only"
on public.weekly_reports
for delete
to authenticated
using (public.current_profile_role() = 'admin');

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



-- PDF Report Customization complete RLS/RPC fix.
-- Run this file in Supabase SQL Editor.
-- Safe to run multiple times.
-- It keeps RLS enabled, allows everyone to read saved PDF template settings,
-- and allows only authenticated approved Admin users to insert/update PDF settings.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings add column if not exists key text;
alter table public.app_settings add column if not exists value jsonb default '{}'::jsonb;
alter table public.app_settings add column if not exists updated_by text;
alter table public.app_settings add column if not exists updated_at timestamptz default now();

update public.app_settings set value = '{}'::jsonb where value is null;
delete from public.app_settings where key is null;
delete from public.app_settings a
using public.app_settings b
where a.key = b.key
  and a.ctid < b.ctid;

alter table public.app_settings alter column key set not null;
alter table public.app_settings alter column value set not null;
create unique index if not exists app_settings_key_unique on public.app_settings (key);

alter table public.app_settings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;

-- Server-side Admin check used by app_settings policies, storage policies, and the save RPC.
-- Robust for this project: profiles.id may be different from auth.uid(),
-- some older admin rows may have NULL/blank status, and JWT email can differ by source.
-- Admin permission is still verified against public.profiles, not localStorage.
create or replace function public.is_pdf_customization_admin()
returns boolean
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
  select exists (
    select 1
    from public.profiles p
    cross join auth_context ac
    where lower(trim(coalesce(p.role, ''))) in ('admin', 'admin/editor')
      and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') in ('active', 'approved')
      and (
        (ac.uid is not null and p.id = ac.uid)
        or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
      )
  );
$$;
grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

-- Replace all app_settings policies with one clean set.
-- This prevents old/non-admin write policies from staying active.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
  loop
    execute format('drop policy if exists %I on public.app_settings', pol.policyname);
  end loop;
end $$;

create policy "app_settings_read_global"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "app_settings_insert_admin_only"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_pdf_customization_admin());

create policy "app_settings_update_admin_only"
  on public.app_settings
  for update
  to authenticated
  using (public.is_pdf_customization_admin())
  with check (public.is_pdf_customization_admin());

-- Secure backend save endpoint used by the frontend.
-- It performs one stable-key upsert and bypasses direct frontend RLS insert problems,
-- while still verifying Admin permission inside the database.
create or replace function public.save_pdf_report_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save PDF report settings.';
  end if;

  if not public.is_pdf_customization_admin() then
    raise exception 'Your Supabase login is not linked to an Active Admin profile. Please run the updated PDF SQL, refresh, then log out/in with the approved Admin email if needed.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'pdf_report',
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_pdf_report_settings(jsonb, text) to authenticated;

-- Default PDF report customization row.
-- Existing custom values are preserved; missing default keys are added.
insert into public.app_settings (key, value, updated_by, updated_at)
values (
  'pdf_report',
  jsonb_build_object(
    'logoUrl', '',
    'logoPath', '',
    'reportTitle', 'Pharmacy Research Project Management Report',
    'headerText', 'Hawler Medical University – College of Pharmacy',
    'universityName', 'Hawler Medical University',
    'collegeName', 'College of Pharmacy',
    'departmentName', 'Department of Pharmacy',
    'footerText', '',
    'showPageNumbers', true,
    'showGeneratedDateTime', true,
    'sections', jsonb_build_object(
      'userInformation', true,
      'studentInformation', true,
      'supervisorInformation', true,
      'researchGroup', true,
      'researchTitle', true,
      'weeklyReports', true,
      'feedback', true,
      'projectProgress', true,
      'deadlines', true,
      'finalEvaluationRubric', true,
      'signatures', true,
      'generatedDateTime', true
    )
  ),
  'system',
  now()
)
on conflict (key) do update set
  value = excluded.value || public.app_settings.value,
  updated_at = now();

-- Reuse/create the existing public app-assets bucket for PDF report logos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
  allowed_mime_types = (
    select array_agg(distinct t.mime_type)
    from unnest(coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || excluded.allowed_mime_types) as t(mime_type)
  );

-- PDF logo storage policies.
drop policy if exists "Public can view PDF report logos" on storage.objects;
create policy "Public can view PDF report logos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'app-assets' and (storage.foldername(name))[1] = 'pdf-reports');

drop policy if exists "Admins can upload PDF report logos" on storage.objects;
create policy "Admins can upload PDF report logos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

drop policy if exists "Admins can update PDF report logos" on storage.objects;
create policy "Admins can update PDF report logos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  )
  with check (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

drop policy if exists "Admins can delete PDF report logos" on storage.objects;
create policy "Admins can delete PDF report logos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'app-assets'
    and (storage.foldername(name))[1] = 'pdf-reports'
    and public.is_pdf_customization_admin()
  );

notify pgrst, 'reload schema';
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

-- Latest supervisor deadline assigned-student targeting/RLS fix is available in:
-- supabase/supervisor_deadline_assigned_students_fix.sql

-- Website settings global save/RLS fix.
-- Keeps app_settings RLS enabled and uses a secure admin-only RPC for website/login settings.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;

create or replace function public.is_app_settings_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  -- Robust admin check for this project.
  -- profiles.id may not equal auth.uid(), so email matching is included.
  -- Status is intentionally permissive for legacy admin rows: only clearly blocked/rejected statuses are denied.
  with auth_context as (
    select
      auth.uid() as uid,
      lower(trim(coalesce(
        auth.jwt() ->> 'email',
        (select au.email from auth.users au where au.id = auth.uid()),
        ''
      ))) as email
  )
  select exists (
    select 1
    from public.profiles p
    cross join auth_context ac
    where lower(trim(coalesce(p.role, ''))) in ('admin', 'admin/editor', 'administrator')
      and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') not in ('rejected', 'disabled', 'inactive', 'blocked', 'suspended')
      and (
        (ac.uid is not null and p.id = ac.uid)
        or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
      )
  );
$$;

grant execute on function public.is_app_settings_admin() to anon, authenticated;

create or replace function public.is_pdf_customization_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select public.is_app_settings_admin();
$$;

grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
  loop
    execute format('drop policy if exists %I on public.app_settings', pol.policyname);
  end loop;
end $$;

create policy "app_settings_read_global"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "app_settings_insert_admin_only"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_app_settings_admin());

create policy "app_settings_update_admin_only"
  on public.app_settings
  for update
  to authenticated
  using (public.is_app_settings_admin())
  with check (public.is_app_settings_admin());

create policy "app_settings_delete_admin_only"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_app_settings_admin());

create or replace function public.save_website_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save website settings.';
  end if;

  if not public.is_app_settings_admin() then
    raise exception 'Only approved Admin accounts can edit website settings.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'website',
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_website_settings(jsonb, text) to authenticated;

-- Compatibility overload for projects/clients that call the RPC with only next_value.
create or replace function public.save_website_settings(next_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.save_website_settings(next_value, null);
end;
$$;

grant execute on function public.save_website_settings(jsonb) to authenticated;


create or replace function public.save_pdf_report_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save PDF report settings.';
  end if;

  if not public.is_app_settings_admin() then
    raise exception 'Only approved Admin accounts can edit PDF report customization settings.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'pdf_report',
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_pdf_report_settings(jsonb, text) to authenticated;

-- 202606290012 Hero/Login background settings global save fix: run supabase/website_settings.sql for complete app_settings/storage policies.

-- 202606290013 Supervisor assignment button/email backend fix:
-- Run supabase/supervisor_assignment_email_backend_fix.sql and deploy send-platform-email Edge Function.
-- Supervisor assignment Edge Function / email notification fix
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;
alter table public.profiles add column if not exists assigned_supervisor_email_sent_at timestamptz;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_email text;

alter table public.research_projects add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.research_projects add column if not exists supervisor_email text;
alter table public.research_projects add column if not exists supervisor_name text;
alter table public.research_projects add column if not exists updated_at timestamptz;

create index if not exists idx_profiles_assigned_supervisor_id on public.profiles(assigned_supervisor_id);
create index if not exists idx_research_projects_supervisor_id on public.research_projects(supervisor_id);

create or replace function public.current_admin_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where (
      p.id = auth.uid()
      or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and lower(coalesce(p.role, '')) in ('admin', 'admin/editor', 'administrator')
    and lower(coalesce(nullif(p.status, ''), 'active')) in ('active', 'approved', 'accepted')
  limit 1;
$$;

grant execute on function public.current_admin_profile_id() to authenticated;

-- Drop the old function first because PostgreSQL cannot change a function return type with CREATE OR REPLACE.
drop function if exists public.admin_assign_student_to_supervisor(uuid, uuid);

create or replace function public.admin_assign_student_to_supervisor(
  target_student_id uuid,
  target_supervisor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  student_record public.profiles%rowtype;
  supervisor_record public.profiles%rowtype;
  same_supervisor boolean := false;
begin
  admin_id := public.current_admin_profile_id();
  if admin_id is null then
    raise exception 'You do not have permission to access this admin feature.';
  end if;

  select * into student_record
  from public.profiles
  where id = target_student_id and lower(coalesce(role, '')) = 'student';

  if student_record.id is null then
    raise exception 'Student account not found.';
  end if;

  if target_supervisor_id is not null then
    select * into supervisor_record
    from public.profiles
    where id = target_supervisor_id and lower(coalesce(role, '')) = 'supervisor';

    if supervisor_record.id is null then
      raise exception 'Supervisor account not found.';
    end if;

    same_supervisor :=
      student_record.assigned_supervisor_id = supervisor_record.id
      or lower(coalesce(student_record.assigned_supervisor_email, '')) = lower(coalesce(supervisor_record.email, ''))
      or lower(coalesce(student_record.assigned_supervisor_name, '')) = lower(coalesce(supervisor_record.full_name, ''));
  end if;

  update public.profiles
  set assigned_supervisor_id = case when target_supervisor_id is null then null else supervisor_record.id end,
      assigned_supervisor_email = case when target_supervisor_id is null then '' else coalesce(supervisor_record.email, '') end,
      assigned_supervisor_name = case when target_supervisor_id is null then '' else coalesce(supervisor_record.full_name, '') end,
      assigned_supervisor_email_sent_at = case when same_supervisor then student_record.assigned_supervisor_email_sent_at else null end,
      assigned_supervisor_email_supervisor_id = case when same_supervisor then student_record.assigned_supervisor_email_supervisor_id else null end,
      assigned_supervisor_email_supervisor_email = case when same_supervisor then student_record.assigned_supervisor_email_supervisor_email else '' end
  where id = student_record.id;

  update public.research_projects
  set supervisor_id = case when target_supervisor_id is null then null else supervisor_record.id end,
      supervisor_email = case when target_supervisor_id is null then '' else coalesce(supervisor_record.email, '') end,
      supervisor_name = case when target_supervisor_id is null then 'Pending Assignment' else coalesce(supervisor_record.full_name, 'Pending Assignment') end,
      updated_at = now()
  where student_id = student_record.id
     or created_by = student_record.id
     or lower(coalesce(student_email, '')) = lower(coalesce(student_record.email, ''))
     or lower(coalesce(created_by_email, '')) = lower(coalesce(student_record.email, ''))
     or lower(coalesce(group_name, '')) = lower(coalesce(student_record.full_name, ''))
     or lower(coalesce(student_record.full_name, '')) = any(select lower(unnest(coalesce(students, array[]::text[]))));

  return jsonb_build_object(
    'success', true,
    'assignmentSaved', true,
    'sameSupervisor', same_supervisor,
    'studentId', student_record.id,
    'supervisorId', case when target_supervisor_id is null then null else supervisor_record.id end
  );
end;
$$;

grant execute on function public.admin_assign_student_to_supervisor(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.research_projects enable row level security;

drop policy if exists "profiles_update_admin_assignment" on public.profiles;
create policy "profiles_update_admin_assignment"
on public.profiles
for update
to authenticated
using (public.current_admin_profile_id() is not null)
with check (public.current_admin_profile_id() is not null);

drop policy if exists "projects_update_admin_assignment" on public.research_projects;
create policy "projects_update_admin_assignment"
on public.research_projects
for update
to authenticated
using (public.current_admin_profile_id() is not null)
with check (public.current_admin_profile_id() is not null);
-- Student-supervisor question system
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.student_questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  student_email text,
  student_name text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_email text,
  supervisor_name text,
  question_text text not null,
  answer_text text,
  status text not null default 'Pending' check (status in ('Pending','Answered')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  answered_by_name text
);

alter table public.student_questions add column if not exists student_email text;
alter table public.student_questions add column if not exists student_name text;
alter table public.student_questions add column if not exists supervisor_email text;
alter table public.student_questions add column if not exists supervisor_name text;
alter table public.student_questions add column if not exists answer_text text;
alter table public.student_questions add column if not exists answered_at timestamptz;
alter table public.student_questions add column if not exists answered_by uuid references public.profiles(id) on delete set null;
alter table public.student_questions add column if not exists answered_by_name text;

create index if not exists idx_student_questions_student_id on public.student_questions(student_id);
create index if not exists idx_student_questions_supervisor_id on public.student_questions(supervisor_id);
create index if not exists idx_student_questions_status on public.student_questions(status);
create index if not exists idx_student_questions_created_at on public.student_questions(created_at desc);

alter table public.student_questions enable row level security;

drop policy if exists "Student questions select allowed" on public.student_questions;
drop policy if exists "Student questions insert own assigned" on public.student_questions;
drop policy if exists "Student questions supervisor answer assigned" on public.student_questions;
drop policy if exists "Student questions admin manage all" on public.student_questions;

create policy "Student questions select allowed" on public.student_questions
for select to authenticated
using (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'student'
    and (
      student_id = public.current_profile_id()
      or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and (
      supervisor_id = public.current_profile_id()
      or lower(coalesce(supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
      or exists (
        select 1 from public.profiles s
        where s.role = 'student'
          and (
            s.id = student_questions.student_id
            or lower(coalesce(s.email, '')) = lower(coalesce(student_questions.student_email, ''))
          )
          and (
            s.assigned_supervisor_id = public.current_profile_id()
            or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      )
      or exists (
        select 1 from public.research_projects p
        where (
            p.student_id = student_questions.student_id
            or p.created_by = student_questions.student_id
            or lower(coalesce(p.student_email, '')) = lower(coalesce(student_questions.student_email, ''))
            or lower(coalesce(p.created_by_email, '')) = lower(coalesce(student_questions.student_email, ''))
          )
          and (
            p.supervisor_id = public.current_profile_id()
            or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      )
    )
  )
);

create policy "Student questions insert own assigned" on public.student_questions
for insert to authenticated
with check (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
  and status = 'Pending'
  and coalesce(answer_text, '') = ''
  and (
    exists (
      select 1 from public.profiles s
      where s.id = public.current_profile_id()
        and (
          s.assigned_supervisor_id = student_questions.supervisor_id
          or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(student_questions.supervisor_email, ''))
          or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(student_questions.supervisor_name, ''))
        )
    )
    or exists (
      select 1 from public.research_projects p
      where (
          p.student_id = public.current_profile_id()
          or p.created_by = public.current_profile_id()
          or lower(coalesce(p.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(p.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
        )
        and (
          p.supervisor_id = student_questions.supervisor_id
          or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(student_questions.supervisor_email, ''))
          or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(student_questions.supervisor_name, ''))
        )
    )
  )
);

create policy "Student questions supervisor answer assigned" on public.student_questions
for update to authenticated
using (
  public.current_profile_role() = 'supervisor'
  and (
    supervisor_id = public.current_profile_id()
    or lower(coalesce(supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    or lower(coalesce(supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
    or exists (
      select 1 from public.profiles s
      where s.role = 'student'
        and (
          s.id = student_questions.student_id
          or lower(coalesce(s.email, '')) = lower(coalesce(student_questions.student_email, ''))
        )
        and (
          s.assigned_supervisor_id = public.current_profile_id()
          or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
)
with check (
  public.current_profile_role() = 'supervisor'
  and status in ('Pending','Answered')
);

create policy "Student questions admin manage all" on public.student_questions
for all to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

grant select, insert, update on public.student_questions to authenticated;
