-- Research Committee group request and direct membership management update
-- Safe to run multiple times in Supabase SQL Editor.
-- Allows Research Committee users to manage group join requests and direct group membership,
-- while keeping students limited to their own requests and supervisors limited to supervised groups.

create extension if not exists "uuid-ossp";

alter table public.profiles add column if not exists current_research_group_id uuid references public.research_projects(id) on delete set null;
alter table public.profiles add column if not exists current_research_group_name text;
alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;

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

create table if not exists public.research_group_members (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.research_projects(id) on delete cascade,
  project_id uuid references public.research_projects(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  student_email text,
  student_name text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_email text,
  supervisor_name text,
  joined_via_request_id uuid references public.group_join_requests(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Removed')),
  joined_at timestamptz default now(),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.research_group_members add column if not exists project_id uuid references public.research_projects(id) on delete cascade;
alter table public.research_group_members add column if not exists student_email text;
alter table public.research_group_members add column if not exists student_name text;
alter table public.research_group_members add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.research_group_members add column if not exists supervisor_email text;
alter table public.research_group_members add column if not exists supervisor_name text;
alter table public.research_group_members add column if not exists joined_via_request_id uuid references public.group_join_requests(id) on delete set null;
alter table public.research_group_members add column if not exists status text default 'Active';
alter table public.research_group_members add column if not exists joined_at timestamptz default now();
alter table public.research_group_members add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.research_group_members add column if not exists created_at timestamptz default now();

create unique index if not exists research_group_members_unique_group_student_id
  on public.research_group_members(group_id, student_id);
create unique index if not exists research_group_members_unique_group_student_email
  on public.research_group_members(group_id, student_email);

alter table public.group_join_requests enable row level security;
alter table public.research_group_members enable row level security;

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

-- Research Committee can view all group requests like Admin.
drop policy if exists "group_requests_select_allowed" on public.group_join_requests;
create policy "group_requests_select_allowed" on public.group_join_requests
for select to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
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

-- Research Committee can accept/reject all requests like Admin; supervisors remain scoped to their groups.
drop policy if exists "group_requests_update_admin_or_group_supervisor" on public.group_join_requests;
create policy "group_requests_update_admin_or_group_supervisor" on public.group_join_requests
for update to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
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
    where p.role in ('admin','committee')
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

-- Research Committee can view, insert, and update official group membership records like Admin.
drop policy if exists "research_group_members_select_allowed" on public.research_group_members;
create policy "research_group_members_select_allowed" on public.research_group_members
for select to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
       or (p.role = 'student' and (research_group_members.student_id = p.id or lower(coalesce(research_group_members.student_email,'')) = lower(p.email)))
       or (
          p.role = 'supervisor'
          and (
            research_group_members.supervisor_id = p.id
            or lower(coalesce(research_group_members.supervisor_email,'')) = lower(p.email)
            or exists (
              select 1 from public.research_projects rp
              where rp.id = research_group_members.group_id
                and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
            )
          )
       )
  )
);

drop policy if exists "research_group_members_insert_admin_or_group_supervisor" on public.research_group_members;
create policy "research_group_members_insert_admin_or_group_supervisor" on public.research_group_members
for insert to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
       or (
          p.role = 'supervisor'
          and exists (
            select 1 from public.research_projects rp
            where rp.id = research_group_members.group_id
              and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
          )
       )
  )
);

drop policy if exists "research_group_members_update_admin_or_group_supervisor" on public.research_group_members;
create policy "research_group_members_update_admin_or_group_supervisor" on public.research_group_members
for update to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
       or (
          p.role = 'supervisor'
          and exists (
            select 1 from public.research_projects rp
            where rp.id = research_group_members.group_id
              and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
          )
       )
  )
)
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
       or (
          p.role = 'supervisor'
          and exists (
            select 1 from public.research_projects rp
            where rp.id = research_group_members.group_id
              and (rp.supervisor_id = p.id or lower(coalesce(rp.supervisor_email,'')) = lower(p.email) or lower(coalesce(rp.supervisor_name,'')) = lower(p.full_name))
          )
       )
  )
);

-- Explicit profile membership update policy for Admin/Research Committee group management.
drop policy if exists "profiles_update_group_membership_admin_committee" on public.profiles;
create policy "profiles_update_group_membership_admin_committee" on public.profiles
for update to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
  )
)
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
  )
);
