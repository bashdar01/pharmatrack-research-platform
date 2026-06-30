-- Research group join request system
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

alter table public.profiles add column if not exists current_research_group_id uuid references public.research_projects(id) on delete set null;
alter table public.profiles add column if not exists current_research_group_name text;

create table if not exists public.group_join_requests (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.profiles(id) on delete cascade,
  student_email text,
  student_name text,
  requested_group_id uuid references public.research_projects(id) on delete cascade,
  requested_group_name text,
  requested_project_title text,
  current_group_id uuid references public.research_projects(id) on delete set null,
  current_group_name text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_email text,
  supervisor_name text,
  status text not null default 'Pending' check (status in ('Pending','Accepted','Rejected')),
  request_message text,
  decision_message text,
  requested_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_by_name text,
  decision_email_sent_at timestamptz,
  created_at timestamptz default now()
);

alter table public.group_join_requests add column if not exists student_email text;
alter table public.group_join_requests add column if not exists student_name text;
alter table public.group_join_requests add column if not exists requested_group_name text;
alter table public.group_join_requests add column if not exists requested_project_title text;
alter table public.group_join_requests add column if not exists current_group_id uuid references public.research_projects(id) on delete set null;
alter table public.group_join_requests add column if not exists current_group_name text;
alter table public.group_join_requests add column if not exists supervisor_email text;
alter table public.group_join_requests add column if not exists supervisor_name text;
alter table public.group_join_requests add column if not exists request_message text;
alter table public.group_join_requests add column if not exists decision_message text;
alter table public.group_join_requests add column if not exists requested_at timestamptz default now();
alter table public.group_join_requests add column if not exists decided_at timestamptz;
alter table public.group_join_requests add column if not exists decided_by uuid references public.profiles(id) on delete set null;
alter table public.group_join_requests add column if not exists decided_by_name text;
alter table public.group_join_requests add column if not exists decision_email_sent_at timestamptz;
alter table public.group_join_requests add column if not exists created_at timestamptz default now();

create index if not exists group_join_requests_student_idx on public.group_join_requests(student_id, student_email);
create index if not exists group_join_requests_group_idx on public.group_join_requests(requested_group_id);
create index if not exists group_join_requests_status_idx on public.group_join_requests(status);
create unique index if not exists group_join_requests_unique_pending_student_group
  on public.group_join_requests(student_id, requested_group_id)
  where status = 'Pending' and student_id is not null and requested_group_id is not null;

alter table public.group_join_requests enable row level security;

create or replace function public.current_profile_for_rls()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles p
  where p.id = auth.uid()
     or lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

drop policy if exists "group_requests_select_allowed" on public.group_join_requests;
create policy "group_requests_select_allowed" on public.group_join_requests
for select to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'admin'
       or (p.role = 'student' and (group_join_requests.student_id = p.id or lower(coalesce(group_join_requests.student_email,'')) = lower(p.email)))
       or (
          p.role = 'supervisor'
          and (
            group_join_requests.supervisor_id = p.id
            or lower(coalesce(group_join_requests.supervisor_email,'')) = lower(p.email)
            or exists (
              select 1 from public.research_projects rp
              where rp.id = group_join_requests.requested_group_id
                and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
            )
          )
       )
  )
);

drop policy if exists "group_requests_insert_student_own" on public.group_join_requests;
create policy "group_requests_insert_student_own" on public.group_join_requests
for insert to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
      and (group_join_requests.student_id = p.id or lower(coalesce(group_join_requests.student_email,'')) = lower(p.email))
      and group_join_requests.status = 'Pending'
  )
);

drop policy if exists "group_requests_update_admin_or_group_supervisor" on public.group_join_requests;
create policy "group_requests_update_admin_or_group_supervisor" on public.group_join_requests
for update to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'admin'
       or (
          p.role = 'supervisor'
          and (
            group_join_requests.supervisor_id = p.id
            or lower(coalesce(group_join_requests.supervisor_email,'')) = lower(p.email)
            or exists (
              select 1 from public.research_projects rp
              where rp.id = group_join_requests.requested_group_id
                and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
            )
          )
       )
  )
)
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'admin'
       or (
          p.role = 'supervisor'
          and (
            group_join_requests.supervisor_id = p.id
            or lower(coalesce(group_join_requests.supervisor_email,'')) = lower(p.email)
            or exists (
              select 1 from public.research_projects rp
              where rp.id = group_join_requests.requested_group_id
                and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
            )
          )
       )
  )
);

-- Optional helper used by admins/support to verify requests.
create or replace view public.group_join_request_summary as
select
  gjr.*,
  rp.title as requested_project_title_live,
  rp.group_name as requested_group_name_live,
  p.full_name as student_full_name_live,
  p.email as student_email_live
from public.group_join_requests gjr
left join public.research_projects rp on rp.id = gjr.requested_group_id
left join public.profiles p on p.id = gjr.student_id;
