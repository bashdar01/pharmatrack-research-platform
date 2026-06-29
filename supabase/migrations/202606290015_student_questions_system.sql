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
