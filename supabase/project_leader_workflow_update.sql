-- Project leader workflow update
-- Safe/idempotent. Adds project-level leader fields and enforces weekly report submission by project leader only.
-- Run this in Supabase SQL Editor after deploying the frontend.

begin;

-- 1) Store the project leader on the project and on the membership record.
alter table public.research_projects
  add column if not exists project_leader_id uuid references public.profiles(id) on delete set null,
  add column if not exists project_leader_name text,
  add column if not exists project_leader_email text,
  add column if not exists project_leader_assigned_at timestamptz,
  add column if not exists project_leader_assigned_by uuid references public.profiles(id) on delete set null;

alter table public.research_group_members
  add column if not exists member_role text not null default 'member',
  add column if not exists role_assigned_at timestamptz,
  add column if not exists role_assigned_by uuid references public.profiles(id) on delete set null;

-- Keep member roles normalized. Do not fail if old values exist.
alter table public.research_group_members drop constraint if exists research_group_members_member_role_check;
alter table public.research_group_members
  add constraint research_group_members_member_role_check
  check (member_role in ('member', 'project_leader'));

create index if not exists research_group_members_leader_idx
  on public.research_group_members(group_id, member_role)
  where member_role = 'project_leader' and status = 'Active';

-- 2) Helper: current profile role/id/email functions may already exist in schema.sql.
-- The assign function checks that only project supervisor, admin, or research committee can set a leader.
create or replace function public.assign_project_leader(p_project_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := public.current_profile_id();
  actor_role text := public.current_profile_role();
  actor_email text := public.current_profile_email();
  actor_name text := public.current_profile_full_name();
  v_project public.research_projects%rowtype;
  v_student public.profiles%rowtype;
  v_is_member boolean;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Unauthorized.';
  end if;

  select * into v_project from public.research_projects where id = p_project_id;
  if not found then
    raise exception 'Research project was not found.';
  end if;

  if not (
    actor_role in ('admin', 'committee')
    or (
      actor_role = 'supervisor'
      and (
        v_project.supervisor_id = actor_id
        or lower(coalesce(v_project.supervisor_email, '')) = lower(coalesce(actor_email, ''))
        or lower(coalesce(v_project.supervisor_name, '')) = lower(coalesce(actor_name, ''))
      )
    )
  ) then
    raise exception 'You do not have permission to assign a project leader for this project.';
  end if;

  select * into v_student from public.profiles where id = p_student_id and role = 'student';
  if not found then
    raise exception 'Project leader must be a student.';
  end if;

  select exists (
    select 1 from public.research_group_members rgm
    where rgm.group_id = p_project_id
      and rgm.status = 'Active'
      and (
        rgm.student_id = p_student_id
        or lower(coalesce(rgm.student_email, '')) = lower(coalesce(v_student.email, ''))
      )
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Project leader must be an existing member of this project.';
  end if;

  update public.research_group_members
  set member_role = 'member'
  where group_id = p_project_id
    and member_role = 'project_leader';

  update public.research_group_members
  set member_role = 'project_leader',
      role_assigned_at = now(),
      role_assigned_by = actor_id
  where group_id = p_project_id
    and status = 'Active'
    and (
      student_id = p_student_id
      or lower(coalesce(student_email, '')) = lower(coalesce(v_student.email, ''))
    );

  update public.research_projects
  set project_leader_id = v_student.id,
      project_leader_name = v_student.full_name,
      project_leader_email = v_student.email,
      project_leader_assigned_at = now(),
      project_leader_assigned_by = actor_id
  where id = p_project_id;

  return jsonb_build_object('ok', true, 'project_id', p_project_id, 'project_leader_id', p_student_id);
end;
$$;

grant execute on function public.assign_project_leader(uuid, uuid) to authenticated;

-- 3) Helper used by RLS/trigger to verify weekly report submitter is the project leader.
create or replace function public.is_project_leader_for_weekly_report(p_project_id uuid, p_student_id uuid, p_student_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.research_projects rp
    left join public.research_group_members rgm
      on rgm.group_id = rp.id
      and rgm.status = 'Active'
      and rgm.member_role = 'project_leader'
    where rp.id = p_project_id
      and (
        (rp.project_leader_id is not null and rp.project_leader_id = p_student_id)
        or (p_student_email is not null and lower(coalesce(rp.project_leader_email, '')) = lower(coalesce(p_student_email, '')))
        or (rgm.student_id is not null and rgm.student_id = p_student_id)
        or (p_student_email is not null and lower(coalesce(rgm.student_email, '')) = lower(coalesce(p_student_email, '')))
      )
  );
$$;

grant execute on function public.is_project_leader_for_weekly_report(uuid, uuid, text) to authenticated;

-- 4) Backend safety: students may insert weekly reports only if they are the project leader.
-- Admin inserts remain allowed for migration/testing, but normal students are blocked.
create or replace function public.enforce_weekly_report_project_leader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'student' then
    if not public.is_project_leader_for_weekly_report(
      new.project_id,
      coalesce(new.student_id, new.submitted_by_id, new.user_id, new.created_by, public.current_profile_id()),
      coalesce(new.student_email, new.submitted_by_email, new.created_by_email, public.current_profile_email())
    ) then
      raise exception 'Only the project leader can submit weekly reports for this project.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists weekly_reports_project_leader_guard on public.weekly_reports;
create trigger weekly_reports_project_leader_guard
before insert on public.weekly_reports
for each row
execute function public.enforce_weekly_report_project_leader();

-- 5) Tighten the RLS insert policy while preserving admin behavior.
alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_insert_own_student" on public.weekly_reports;
create policy "weekly_reports_insert_project_leader_student"
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
      or created_by = public.current_profile_id()
      or lower(coalesce(submitted_by_email, student_email, created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
    and public.is_project_leader_for_weekly_report(
      project_id,
      coalesce(student_id, submitted_by_id, user_id, created_by, public.current_profile_id()),
      coalesce(student_email, submitted_by_email, created_by_email, public.current_profile_email())
    )
  )
);

commit;
