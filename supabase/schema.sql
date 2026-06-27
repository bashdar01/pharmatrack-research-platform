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
  evaluation_type text not null,
  attendance_score integer default 0,
  progress_score integer default 0,
  research_quality_score integer default 0,
  writing_score integer default 0,
  presentation_score integer default 0,
  teamwork_score integer default 0,
  total_score integer generated always as (
    attendance_score + progress_score + research_quality_score + writing_score + presentation_score + teamwork_score
  ) stored,
  comments text,
  created_at timestamptz default now()
);

create table if not exists public.deadlines (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  deadline_type text not null,
  due_date date not null,
  academic_year text default '2026-2027',
  status text default 'Active',
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
alter table public.notifications add column if not exists notification_type text;
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

create policy "evaluations_select_authenticated" on public.evaluations for select to anon, authenticated using (true);
create policy "evaluations_insert_authenticated" on public.evaluations for insert to anon, authenticated with check (true);
create policy "evaluations_update_authenticated" on public.evaluations for update to anon, authenticated using (true);

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

create policy "audit_logs_select_authenticated" on public.audit_logs for select to anon, authenticated using (true);
create policy "audit_logs_insert_authenticated" on public.audit_logs for insert to anon, authenticated with check (true);

-- Create the Storage bucket manually in Supabase Dashboard:
-- Storage > New bucket > Name: project-files > Private bucket.
