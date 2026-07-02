-- Audit log, weekly report permission, and project leader/progress guard fixes.
-- Safe/idempotent. Run once in Supabase SQL Editor after deploying the frontend.

begin;

-- 1) Make audit logs useful while keeping old rows/columns compatible.
alter table public.audit_logs
  add column if not exists actor_id uuid,
  add column if not exists actor_email text,
  add column if not exists actor_role text,
  add column if not exists action_type text,
  add column if not exists affected_entity text,
  add column if not exists affected_user_id uuid,
  add column if not exists affected_project_id uuid,
  add column if not exists affected_report_id uuid,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists description text,
  add column if not exists details jsonb;

update public.audit_logs
set action_type = coalesce(action_type, action),
    affected_entity = coalesce(affected_entity, entity),
    description = coalesce(description, concat(coalesce(actor, 'System'), ' ', coalesce(action, 'updated'), ' ', coalesce(entity, 'record')))
where action_type is null or affected_entity is null or description is null;

alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_select_authenticated" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;
drop policy if exists "audit_logs_select_admin_only" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated_secure" on public.audit_logs;

create policy "audit_logs_select_admin_only"
on public.audit_logs
for select
to authenticated
using (public.current_profile_role() = 'admin');

create policy "audit_logs_insert_authenticated_secure"
on public.audit_logs
for insert
to authenticated
with check (public.current_profile_role() in ('admin', 'committee', 'supervisor', 'student'));

-- 2) Weekly report backend rule:
--    allow a student to submit if they are the assigned project leader OR if they are the only active student member.
create or replace function public.can_submit_weekly_report_for_project(p_project_id uuid, p_student_id uuid, p_student_email text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_active_member_count integer := 0;
  v_is_active_member boolean := false;
  v_project public.research_projects%rowtype;
begin
  if p_project_id is null then
    return false;
  end if;

  select * into v_project from public.research_projects where id = p_project_id;
  if not found then
    return false;
  end if;

  select count(*), coalesce(bool_or(
    (p_student_id is not null and rgm.student_id = p_student_id)
    or (p_student_email is not null and lower(coalesce(rgm.student_email, '')) = lower(coalesce(p_student_email, '')))
  ), false)
  into v_active_member_count, v_is_active_member
  from public.research_group_members rgm
  where rgm.group_id = p_project_id
    and coalesce(rgm.status, 'Active') = 'Active'
    and (rgm.student_id is not null or coalesce(rgm.student_email, '') <> '');

  -- Backward compatibility for old records that used research_projects.students before research_group_members existed.
  if v_active_member_count = 0 then
    v_active_member_count := coalesce(array_length(v_project.students, 1), 0);
    v_is_active_member :=
      (p_student_id is not null and v_project.student_id = p_student_id)
      or (p_student_email is not null and lower(coalesce(v_project.student_email, '')) = lower(coalesce(p_student_email, '')))
      or (p_student_email is not null and exists (
        select 1 from unnest(coalesce(v_project.students, array[]::text[])) as student_label
        where lower(student_label) = lower(coalesce(p_student_email, ''))
           or lower(student_label) = lower(coalesce(public.current_profile_full_name(), ''))
      ));
  end if;

  if v_active_member_count = 1 and v_is_active_member then
    return true;
  end if;

  if v_active_member_count > 1 then
    return public.is_project_leader_for_weekly_report(p_project_id, p_student_id, p_student_email);
  end if;

  return public.is_project_leader_for_weekly_report(p_project_id, p_student_id, p_student_email);
end;
$$;

grant execute on function public.can_submit_weekly_report_for_project(uuid, uuid, text) to authenticated;

create or replace function public.enforce_weekly_report_project_leader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'student' then
    if not public.can_submit_weekly_report_for_project(
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
for each row execute function public.enforce_weekly_report_project_leader();

alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_insert_project_leader_student" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_own_student" on public.weekly_reports;
create policy "weekly_reports_insert_project_leader_or_single_student"
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
    and public.can_submit_weekly_report_for_project(
      project_id,
      coalesce(student_id, submitted_by_id, user_id, created_by, public.current_profile_id()),
      coalesce(student_email, submitted_by_email, created_by_email, public.current_profile_email())
    )
  )
);


-- 3) Backend audit triggers for important direct database actions.
create or replace function public.write_backend_audit_log(
  p_action_type text,
  p_entity text,
  p_description text,
  p_affected_user_id uuid default null,
  p_affected_project_id uuid default null,
  p_affected_report_id uuid default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (
    actor,
    actor_id,
    actor_email,
    actor_role,
    action,
    action_type,
    entity,
    affected_entity,
    affected_user_id,
    affected_project_id,
    affected_report_id,
    old_value,
    new_value,
    description,
    details
  ) values (
    coalesce(public.current_profile_full_name(), public.current_profile_email(), 'System'),
    public.current_profile_id(),
    public.current_profile_email(),
    public.current_profile_role(),
    p_action_type,
    p_action_type,
    p_entity,
    p_entity,
    p_affected_user_id,
    p_affected_project_id,
    p_affected_report_id,
    p_old_value,
    p_new_value,
    p_description,
    jsonb_build_object('backend_trigger', true)
  );
exception when others then
  raise warning 'Audit log trigger failed: %', sqlerrm;
end;
$$;

create or replace function public.audit_profile_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.write_backend_audit_log('role_change', coalesce(new.full_name, new.email, new.id::text), 'User role changed.', new.id, null, null, to_jsonb(old.role), to_jsonb(new.role));
    end if;
    if new.status is distinct from old.status then
      perform public.write_backend_audit_log('user_approval_status_change', coalesce(new.full_name, new.email, new.id::text), 'User approval status changed.', new.id, null, null, to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.assigned_supervisor_id is distinct from old.assigned_supervisor_id or new.assigned_supervisor_email is distinct from old.assigned_supervisor_email then
      perform public.write_backend_audit_log('student_supervisor_assignment', coalesce(new.full_name, new.email, new.id::text), 'Student supervisor assignment changed.', new.id, null, null, jsonb_build_object('supervisor_id', old.assigned_supervisor_id, 'supervisor_email', old.assigned_supervisor_email), jsonb_build_object('supervisor_id', new.assigned_supervisor_id, 'supervisor_email', new.assigned_supervisor_email));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_admin_changes_trigger on public.profiles;
create trigger audit_profile_admin_changes_trigger
after update on public.profiles
for each row execute function public.audit_profile_admin_changes();

create or replace function public.audit_research_project_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.approval is distinct from old.approval or new.status is distinct from old.status then
      perform public.write_backend_audit_log('committee_project_decision', coalesce(new.title, new.group_name, new.id::text), 'Research project committee decision/status changed.', null, new.id, null, jsonb_build_object('approval', old.approval, 'status', old.status), jsonb_build_object('approval', new.approval, 'status', new.status));
    end if;
    if new.supervisor_id is distinct from old.supervisor_id or new.supervisor_email is distinct from old.supervisor_email then
      perform public.write_backend_audit_log('project_supervisor_assignment', coalesce(new.title, new.group_name, new.id::text), 'Project supervisor assignment changed.', new.supervisor_id, new.id, null, jsonb_build_object('supervisor_id', old.supervisor_id, 'supervisor_email', old.supervisor_email), jsonb_build_object('supervisor_id', new.supervisor_id, 'supervisor_email', new.supervisor_email));
    end if;
    if new.project_leader_id is distinct from old.project_leader_id or new.project_leader_email is distinct from old.project_leader_email then
      perform public.write_backend_audit_log('project_leader_assignment', coalesce(new.title, new.group_name, new.id::text), 'Project leader assignment changed.', new.project_leader_id, new.id, null, jsonb_build_object('leader_id', old.project_leader_id, 'leader_email', old.project_leader_email), jsonb_build_object('leader_id', new.project_leader_id, 'leader_email', new.project_leader_email));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.write_backend_audit_log('project_deleted', coalesce(old.title, old.group_name, old.id::text), 'Research project/title deleted.', null, old.id, null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_research_project_changes_trigger on public.research_projects;
create trigger audit_research_project_changes_trigger
after update or delete on public.research_projects
for each row execute function public.audit_research_project_changes();

create or replace function public.audit_group_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_backend_audit_log('student_added_to_research_group', coalesce(new.student_name, new.student_email, new.student_id::text), 'Student added to research group/project.', new.student_id, coalesce(new.group_id, new.project_id), null, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' and new.member_role is distinct from old.member_role then
    perform public.write_backend_audit_log('project_leader_assignment', coalesce(new.student_name, new.student_email, new.student_id::text), 'Project member role changed.', new.student_id, coalesce(new.group_id, new.project_id), null, to_jsonb(old.member_role), to_jsonb(new.member_role));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_group_membership_changes_trigger on public.research_group_members;
create trigger audit_group_membership_changes_trigger
after insert or update on public.research_group_members
for each row execute function public.audit_group_membership_changes();

create or replace function public.audit_group_join_request_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.write_backend_audit_log('group_join_request_decision', coalesce(new.student_name, new.student_email, new.id::text), 'Group join request decision changed.', new.student_id, new.requested_group_id, null, to_jsonb(old.status), to_jsonb(new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_group_join_request_changes_trigger on public.group_join_requests;
create trigger audit_group_join_request_changes_trigger
after update on public.group_join_requests
for each row execute function public.audit_group_join_request_changes();

create or replace function public.audit_weekly_report_review_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.supervisor_feedback is distinct from old.supervisor_feedback) then
    perform public.write_backend_audit_log('weekly_report_review', coalesce(new.submitted_by, new.student_email, new.id::text), 'Weekly report review/status changed.', coalesce(new.student_id, new.submitted_by_id, new.user_id), null, new.id, jsonb_build_object('status', old.status, 'feedback', old.supervisor_feedback), jsonb_build_object('status', new.status, 'feedback', new.supervisor_feedback));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_weekly_report_review_changes_trigger on public.weekly_reports;
create trigger audit_weekly_report_review_changes_trigger
after update on public.weekly_reports
for each row execute function public.audit_weekly_report_review_changes();

create or replace function public.audit_deadline_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_backend_audit_log('deadline_created', coalesce(new.title, new.id::text), 'Deadline created.', null, null, null, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_backend_audit_log('deadline_updated', coalesce(new.title, new.id::text), 'Deadline updated.', null, null, null, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_backend_audit_log('deadline_deleted', coalesce(old.title, old.id::text), 'Deadline deleted.', null, null, null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_deadline_changes_trigger on public.deadlines;
create trigger audit_deadline_changes_trigger
after insert or update or delete on public.deadlines
for each row execute function public.audit_deadline_changes();

commit;
