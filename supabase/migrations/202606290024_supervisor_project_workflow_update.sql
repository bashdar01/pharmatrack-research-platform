-- Supervisor project/title/group workflow update
-- Safe to run multiple times.
-- New workflow: supervisors submit research projects/groups; Research Committee reviews;
-- only approved projects are visible/joinable for students.

create extension if not exists "uuid-ossp";

alter table public.research_projects add column if not exists project_description text;
alter table public.research_projects add column if not exists expected_members integer;
alter table public.research_projects add column if not exists start_date date;
alter table public.research_projects add column if not exists end_date date;
alter table public.research_projects add column if not exists submitted_by_role text;
alter table public.research_projects add column if not exists submitted_by_name text;
alter table public.research_projects add column if not exists submitted_at timestamptz default now();
alter table public.research_projects add column if not exists created_by_role text;
alter table public.research_projects add column if not exists committee_comments text;
alter table public.research_projects add column if not exists decision_message text;
alter table public.research_projects add column if not exists reviewed_at timestamptz;
alter table public.research_projects add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.research_projects add column if not exists reviewed_by_name text;
alter table public.research_projects add column if not exists accepted_at timestamptz;
alter table public.research_projects add column if not exists supervisor_project_review_email_sent_at timestamptz;
alter table public.research_projects add column if not exists supervisor_project_review_email_status text;
alter table public.research_projects add column if not exists supervisor_project_submitted_email_sent_at timestamptz;

create index if not exists idx_research_projects_approval on public.research_projects(approval);
create index if not exists idx_research_projects_submitted_by_role on public.research_projects(submitted_by_role);
create index if not exists idx_research_projects_supervisor_review on public.research_projects(supervisor_id, approval);

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

-- Students must not submit research titles/groups/projects directly anymore.
-- Supervisors submit to Research Committee; admin/committee remain allowed for management.
alter table public.research_projects enable row level security;
drop policy if exists "projects_insert_authenticated" on public.research_projects;
drop policy if exists "projects_insert_supervisor_committee_admin" on public.research_projects;
create policy "projects_insert_supervisor_committee_admin"
on public.research_projects
for insert
to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('supervisor','admin','committee')
      and coalesce(research_projects.approval, 'Pending Committee Review') in ('Pending Committee Review','Revision Required','Approved','Rejected')
  )
);

-- Research Committee/Admin can review any submitted project; supervisors can update their own submission.
drop policy if exists "projects_update_supervisor_committee_admin" on public.research_projects;
create policy "projects_update_supervisor_committee_admin"
on public.research_projects
for update
to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role in ('admin','committee')
       or (
         p.role = 'supervisor'
         and (
           research_projects.supervisor_id = p.id
           or lower(coalesce(research_projects.supervisor_email,'')) = lower(p.email)
           or lower(coalesce(research_projects.supervisor_name,'')) = lower(p.full_name)
           or research_projects.created_by = p.id
           or lower(coalesce(research_projects.created_by_email,'')) = lower(p.email)
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
           research_projects.supervisor_id = p.id
           or lower(coalesce(research_projects.supervisor_email,'')) = lower(p.email)
           or lower(coalesce(research_projects.supervisor_name,'')) = lower(p.full_name)
           or research_projects.created_by = p.id
           or lower(coalesce(research_projects.created_by_email,'')) = lower(p.email)
         )
       )
  )
);

-- Students can read only approved joinable groups plus their own assigned/joined group through other role-scoped policies.
drop policy if exists "projects_select_student_joinable_groups" on public.research_projects;
create policy "projects_select_student_joinable_groups"
on public.research_projects
for select
to authenticated
using (
  coalesce(research_projects.approval, '') = 'Approved'
  and exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
  )
);

-- Prevent group join requests for projects that are not committee-approved.
create or replace function public.prevent_unapproved_group_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_status text;
  student_group uuid;
begin
  select coalesce(approval, '') into project_status
  from public.research_projects
  where id = new.requested_group_id;

  if project_status <> 'Approved' then
    raise exception 'Students can only request to join projects approved by the Research Committee.';
  end if;

  select current_research_group_id into student_group
  from public.profiles
  where id = new.student_id;

  if student_group is not null then
    raise exception 'You are already assigned to a research group.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unapproved_group_join_request_trigger on public.group_join_requests;
create trigger prevent_unapproved_group_join_request_trigger
before insert on public.group_join_requests
for each row execute function public.prevent_unapproved_group_join_request();

-- Prevent direct membership into unapproved projects unless an admin intentionally changes the approval first.
create or replace function public.prevent_unapproved_group_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_status text;
begin
  select coalesce(approval, '') into project_status
  from public.research_projects
  where id = new.group_id;

  if project_status <> 'Approved' then
    raise exception 'Students can only be added to projects approved by the Research Committee.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unapproved_group_membership_trigger on public.research_group_members;
create trigger prevent_unapproved_group_membership_trigger
before insert or update on public.research_group_members
for each row execute function public.prevent_unapproved_group_membership();

grant execute on function public.current_profile_for_rls() to authenticated;
grant execute on function public.prevent_unapproved_group_join_request() to authenticated;
grant execute on function public.prevent_unapproved_group_membership() to authenticated;
