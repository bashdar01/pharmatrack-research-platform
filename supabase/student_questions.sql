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


-- Student Questions attachment update (202607020005)
-- Student Questions / Supervisor Answers filters and attachments
-- Safe to run multiple times in Supabase SQL Editor.

-- 1) Add attachment metadata columns to the existing question system.
alter table public.student_questions add column if not exists question_attachment_url text;
alter table public.student_questions add column if not exists question_attachment_path text;
alter table public.student_questions add column if not exists question_attachment_name text;
alter table public.student_questions add column if not exists question_attachment_mime_type text;
alter table public.student_questions add column if not exists question_attachment_size bigint;
alter table public.student_questions add column if not exists answer_attachment_url text;
alter table public.student_questions add column if not exists answer_attachment_path text;
alter table public.student_questions add column if not exists answer_attachment_name text;
alter table public.student_questions add column if not exists answer_attachment_mime_type text;
alter table public.student_questions add column if not exists answer_attachment_size bigint;
alter table public.student_questions add column if not exists status text not null default 'Pending';
alter table public.student_questions add column if not exists answered_at timestamptz;
alter table public.student_questions add column if not exists answered_by uuid references public.profiles(id) on delete set null;
alter table public.student_questions add column if not exists answered_by_name text;

create index if not exists idx_student_questions_question_attachment_path on public.student_questions(question_attachment_path) where question_attachment_path is not null;
create index if not exists idx_student_questions_answer_attachment_path on public.student_questions(answer_attachment_path) where answer_attachment_path is not null;

-- 2) Helper functions used by table RLS and Storage RLS.
create or replace function public.question_attachment_question_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_id text;
begin
  v_id := split_part(coalesce(p_name, ''), '/', 2);
  if v_id = '' then
    return null;
  end if;
  return v_id::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.can_access_student_question(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q public.student_questions%rowtype;
  v_role text := public.current_profile_role();
begin
  if p_question_id is null then
    return false;
  end if;

  select * into q from public.student_questions where id = p_question_id;
  if not found then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_role = 'student' then
    return q.student_id = public.current_profile_id()
      or lower(coalesce(q.student_email, '')) = lower(coalesce(public.current_profile_email(), ''));
  end if;

  if v_role = 'supervisor' then
    return q.supervisor_id = public.current_profile_id()
      or lower(coalesce(q.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(q.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
      or exists (
        select 1 from public.profiles s
        where s.role = 'student'
          and (
            s.id = q.student_id
            or lower(coalesce(s.email, '')) = lower(coalesce(q.student_email, ''))
          )
          and (
            s.assigned_supervisor_id = public.current_profile_id()
            or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      )
      or exists (
        select 1
        from public.research_projects p
        left join public.research_group_members rgm on rgm.group_id = p.id
        where (
            p.student_id = q.student_id
            or p.created_by = q.student_id
            or rgm.student_id = q.student_id
            or lower(coalesce(p.student_email, '')) = lower(coalesce(q.student_email, ''))
            or lower(coalesce(p.created_by_email, '')) = lower(coalesce(q.student_email, ''))
            or lower(coalesce(rgm.student_email, '')) = lower(coalesce(q.student_email, ''))
          )
          and (
            p.supervisor_id = public.current_profile_id()
            or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      );
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_student_question(uuid) to authenticated;
grant execute on function public.question_attachment_question_id_from_path(text) to authenticated;

create or replace function public.can_upload_student_question_attachment(p_question_id uuid, p_attachment_type text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q public.student_questions%rowtype;
  v_role text := public.current_profile_role();
  v_type text := lower(coalesce(p_attachment_type, ''));
begin
  if p_question_id is null or v_type not in ('question', 'answer') then
    return false;
  end if;

  select * into q from public.student_questions where id = p_question_id;
  if not found then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_type = 'question' then
    return v_role = 'student'
      and (
        q.student_id = public.current_profile_id()
        or lower(coalesce(q.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      );
  end if;

  if v_type = 'answer' then
    return v_role = 'supervisor' and public.can_access_student_question(p_question_id);
  end if;

  return false;
end;
$$;

grant execute on function public.can_upload_student_question_attachment(uuid, text) to authenticated;

-- 3) Keep question updates role-safe even if someone calls the API directly.
create or replace function public.enforce_student_question_update_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_profile_role();
begin
  if v_role = 'admin' then
    return new;
  end if;

  if v_role = 'student' then
    if not (
      old.student_id = public.current_profile_id()
      or lower(coalesce(old.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    ) then
      raise exception 'Students can only update their own question attachments.' using errcode = '42501';
    end if;

    if new.student_id is distinct from old.student_id
      or new.student_email is distinct from old.student_email
      or new.student_name is distinct from old.student_name
      or new.supervisor_id is distinct from old.supervisor_id
      or new.supervisor_email is distinct from old.supervisor_email
      or new.supervisor_name is distinct from old.supervisor_name
      or new.question_text is distinct from old.question_text
      or new.answer_text is distinct from old.answer_text
      or new.status is distinct from old.status
      or new.answered_at is distinct from old.answered_at
      or new.answered_by is distinct from old.answered_by
      or new.answered_by_name is distinct from old.answered_by_name
      or new.answer_attachment_url is distinct from old.answer_attachment_url
      or new.answer_attachment_path is distinct from old.answer_attachment_path
      or new.answer_attachment_name is distinct from old.answer_attachment_name
      or new.answer_attachment_mime_type is distinct from old.answer_attachment_mime_type
      or new.answer_attachment_size is distinct from old.answer_attachment_size
    then
      raise exception 'Students can only update their own question attachment.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role = 'supervisor' then
    if not public.can_access_student_question(old.id) then
      raise exception 'Supervisors can only answer questions from assigned students.' using errcode = '42501';
    end if;

    if new.student_id is distinct from old.student_id
      or new.student_email is distinct from old.student_email
      or new.student_name is distinct from old.student_name
      or new.supervisor_id is distinct from old.supervisor_id
      or new.supervisor_email is distinct from old.supervisor_email
      or new.supervisor_name is distinct from old.supervisor_name
      or new.question_text is distinct from old.question_text
      or new.question_attachment_url is distinct from old.question_attachment_url
      or new.question_attachment_path is distinct from old.question_attachment_path
      or new.question_attachment_name is distinct from old.question_attachment_name
      or new.question_attachment_mime_type is distinct from old.question_attachment_mime_type
      or new.question_attachment_size is distinct from old.question_attachment_size
    then
      raise exception 'Supervisors can only update answer fields for allowed student questions.' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'You do not have permission to update student questions.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_student_question_update_security on public.student_questions;
create trigger trg_enforce_student_question_update_security
before update on public.student_questions
for each row execute function public.enforce_student_question_update_security();

-- Add a student update policy for attachment metadata. The trigger above restricts fields.
alter table public.student_questions enable row level security;
drop policy if exists "Student questions student update own attachment" on public.student_questions;
create policy "Student questions student update own attachment"
on public.student_questions
for update
to authenticated
using (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
)
with check (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
);

-- 4) Private Storage bucket and policies for question/answer attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-attachments',
  'question-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage path pattern used by the app:
-- student-questions/{question_id}/question/{file}
-- student-questions/{question_id}/answer/{file}
drop policy if exists "question_attachments_select_allowed" on storage.objects;
drop policy if exists "question_attachments_insert_allowed" on storage.objects;
drop policy if exists "question_attachments_update_allowed" on storage.objects;
drop policy if exists "question_attachments_delete_admin_only" on storage.objects;

create policy "question_attachments_select_allowed"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_access_student_question(public.question_attachment_question_id_from_path(name))
);

create policy "question_attachments_insert_allowed"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
);

create policy "question_attachments_update_allowed"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
)
with check (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
);

create policy "question_attachments_delete_admin_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'question-attachments'
  and public.current_profile_role() = 'admin'
);

-- Student Questions attachment update (202607020005)
-- Student Questions / Supervisor Answers filters and attachments
-- Safe to run multiple times in Supabase SQL Editor.

-- 1) Add attachment metadata columns to the existing question system.
alter table public.student_questions add column if not exists question_attachment_url text;
alter table public.student_questions add column if not exists question_attachment_path text;
alter table public.student_questions add column if not exists question_attachment_name text;
alter table public.student_questions add column if not exists question_attachment_mime_type text;
alter table public.student_questions add column if not exists question_attachment_size bigint;
alter table public.student_questions add column if not exists answer_attachment_url text;
alter table public.student_questions add column if not exists answer_attachment_path text;
alter table public.student_questions add column if not exists answer_attachment_name text;
alter table public.student_questions add column if not exists answer_attachment_mime_type text;
alter table public.student_questions add column if not exists answer_attachment_size bigint;
alter table public.student_questions add column if not exists status text not null default 'Pending';
alter table public.student_questions add column if not exists answered_at timestamptz;
alter table public.student_questions add column if not exists answered_by uuid references public.profiles(id) on delete set null;
alter table public.student_questions add column if not exists answered_by_name text;

create index if not exists idx_student_questions_question_attachment_path on public.student_questions(question_attachment_path) where question_attachment_path is not null;
create index if not exists idx_student_questions_answer_attachment_path on public.student_questions(answer_attachment_path) where answer_attachment_path is not null;

-- 2) Helper functions used by table RLS and Storage RLS.
create or replace function public.question_attachment_question_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_id text;
begin
  v_id := split_part(coalesce(p_name, ''), '/', 2);
  if v_id = '' then
    return null;
  end if;
  return v_id::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.can_access_student_question(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q public.student_questions%rowtype;
  v_role text := public.current_profile_role();
begin
  if p_question_id is null then
    return false;
  end if;

  select * into q from public.student_questions where id = p_question_id;
  if not found then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_role = 'student' then
    return q.student_id = public.current_profile_id()
      or lower(coalesce(q.student_email, '')) = lower(coalesce(public.current_profile_email(), ''));
  end if;

  if v_role = 'supervisor' then
    return q.supervisor_id = public.current_profile_id()
      or lower(coalesce(q.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(q.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
      or exists (
        select 1 from public.profiles s
        where s.role = 'student'
          and (
            s.id = q.student_id
            or lower(coalesce(s.email, '')) = lower(coalesce(q.student_email, ''))
          )
          and (
            s.assigned_supervisor_id = public.current_profile_id()
            or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      )
      or exists (
        select 1
        from public.research_projects p
        left join public.research_group_members rgm on rgm.group_id = p.id
        where (
            p.student_id = q.student_id
            or p.created_by = q.student_id
            or rgm.student_id = q.student_id
            or lower(coalesce(p.student_email, '')) = lower(coalesce(q.student_email, ''))
            or lower(coalesce(p.created_by_email, '')) = lower(coalesce(q.student_email, ''))
            or lower(coalesce(rgm.student_email, '')) = lower(coalesce(q.student_email, ''))
          )
          and (
            p.supervisor_id = public.current_profile_id()
            or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
            or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
          )
      );
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_student_question(uuid) to authenticated;
grant execute on function public.question_attachment_question_id_from_path(text) to authenticated;

create or replace function public.can_upload_student_question_attachment(p_question_id uuid, p_attachment_type text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q public.student_questions%rowtype;
  v_role text := public.current_profile_role();
  v_type text := lower(coalesce(p_attachment_type, ''));
begin
  if p_question_id is null or v_type not in ('question', 'answer') then
    return false;
  end if;

  select * into q from public.student_questions where id = p_question_id;
  if not found then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_type = 'question' then
    return v_role = 'student'
      and (
        q.student_id = public.current_profile_id()
        or lower(coalesce(q.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      );
  end if;

  if v_type = 'answer' then
    return v_role = 'supervisor' and public.can_access_student_question(p_question_id);
  end if;

  return false;
end;
$$;

grant execute on function public.can_upload_student_question_attachment(uuid, text) to authenticated;


-- Replace question RLS policies so assignment through research_group_members is also recognized.
drop policy if exists "Student questions select allowed" on public.student_questions;
create policy "Student questions select allowed"
on public.student_questions
for select
to authenticated
using (public.can_access_student_question(id));

drop policy if exists "Student questions insert own assigned" on public.student_questions;
create policy "Student questions insert own assigned"
on public.student_questions
for insert
to authenticated
with check (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
  and coalesce(status, 'Pending') = 'Pending'
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
      select 1
      from public.research_projects p
      left join public.research_group_members rgm on rgm.group_id = p.id
      where (
          p.student_id = public.current_profile_id()
          or p.created_by = public.current_profile_id()
          or rgm.student_id = public.current_profile_id()
          or lower(coalesce(p.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(p.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rgm.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
        )
        and (
          p.supervisor_id = student_questions.supervisor_id
          or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(student_questions.supervisor_email, ''))
          or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(student_questions.supervisor_name, ''))
        )
    )
  )
);

drop policy if exists "Student questions supervisor answer assigned" on public.student_questions;
create policy "Student questions supervisor answer assigned"
on public.student_questions
for update
to authenticated
using (
  public.current_profile_role() = 'supervisor'
  and public.can_access_student_question(id)
)
with check (
  public.current_profile_role() = 'supervisor'
  and public.can_access_student_question(id)
  and status in ('Pending','Answered')
);

-- 3) Keep question updates role-safe even if someone calls the API directly.
create or replace function public.enforce_student_question_update_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_profile_role();
begin
  if v_role = 'admin' then
    return new;
  end if;

  if v_role = 'student' then
    if not (
      old.student_id = public.current_profile_id()
      or lower(coalesce(old.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    ) then
      raise exception 'Students can only update their own question attachments.' using errcode = '42501';
    end if;

    if new.student_id is distinct from old.student_id
      or new.student_email is distinct from old.student_email
      or new.student_name is distinct from old.student_name
      or new.supervisor_id is distinct from old.supervisor_id
      or new.supervisor_email is distinct from old.supervisor_email
      or new.supervisor_name is distinct from old.supervisor_name
      or new.question_text is distinct from old.question_text
      or new.answer_text is distinct from old.answer_text
      or new.status is distinct from old.status
      or new.answered_at is distinct from old.answered_at
      or new.answered_by is distinct from old.answered_by
      or new.answered_by_name is distinct from old.answered_by_name
      or new.answer_attachment_url is distinct from old.answer_attachment_url
      or new.answer_attachment_path is distinct from old.answer_attachment_path
      or new.answer_attachment_name is distinct from old.answer_attachment_name
      or new.answer_attachment_mime_type is distinct from old.answer_attachment_mime_type
      or new.answer_attachment_size is distinct from old.answer_attachment_size
    then
      raise exception 'Students can only update their own question attachment.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role = 'supervisor' then
    if not public.can_access_student_question(old.id) then
      raise exception 'Supervisors can only answer questions from assigned students.' using errcode = '42501';
    end if;

    if new.student_id is distinct from old.student_id
      or new.student_email is distinct from old.student_email
      or new.student_name is distinct from old.student_name
      or new.supervisor_id is distinct from old.supervisor_id
      or new.supervisor_email is distinct from old.supervisor_email
      or new.supervisor_name is distinct from old.supervisor_name
      or new.question_text is distinct from old.question_text
      or new.question_attachment_url is distinct from old.question_attachment_url
      or new.question_attachment_path is distinct from old.question_attachment_path
      or new.question_attachment_name is distinct from old.question_attachment_name
      or new.question_attachment_mime_type is distinct from old.question_attachment_mime_type
      or new.question_attachment_size is distinct from old.question_attachment_size
    then
      raise exception 'Supervisors can only update answer fields for allowed student questions.' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'You do not have permission to update student questions.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_student_question_update_security on public.student_questions;
create trigger trg_enforce_student_question_update_security
before update on public.student_questions
for each row execute function public.enforce_student_question_update_security();

-- Add a student update policy for attachment metadata. The trigger above restricts fields.
alter table public.student_questions enable row level security;
drop policy if exists "Student questions student update own attachment" on public.student_questions;
create policy "Student questions student update own attachment"
on public.student_questions
for update
to authenticated
using (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
)
with check (
  public.current_profile_role() = 'student'
  and (
    student_id = public.current_profile_id()
    or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
  )
);

-- 4) Private Storage bucket and policies for question/answer attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-attachments',
  'question-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage path pattern used by the app:
-- student-questions/{question_id}/question/{file}
-- student-questions/{question_id}/answer/{file}
drop policy if exists "question_attachments_select_allowed" on storage.objects;
drop policy if exists "question_attachments_insert_allowed" on storage.objects;
drop policy if exists "question_attachments_update_allowed" on storage.objects;
drop policy if exists "question_attachments_delete_admin_only" on storage.objects;

create policy "question_attachments_select_allowed"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_access_student_question(public.question_attachment_question_id_from_path(name))
);

create policy "question_attachments_insert_allowed"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
);

create policy "question_attachments_update_allowed"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
)
with check (
  bucket_id = 'question-attachments'
  and split_part(name, '/', 1) = 'student-questions'
  and public.can_upload_student_question_attachment(public.question_attachment_question_id_from_path(name), split_part(name, '/', 3))
);

create policy "question_attachments_delete_admin_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'question-attachments'
  and public.current_profile_role() = 'admin'
);
