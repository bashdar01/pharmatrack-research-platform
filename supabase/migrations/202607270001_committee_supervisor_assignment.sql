-- Research Committee supervisor-assignment access
-- Safe/idempotent. Reuses the existing profiles.assigned_supervisor_* and research_projects.supervisor_* relationships.

begin;

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

create or replace function public.current_supervisor_assignment_manager_profile_id()
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
    and lower(coalesce(p.role, '')) in ('admin', 'admin/editor', 'administrator', 'committee', 'research committee')
    and lower(coalesce(nullif(p.status, ''), 'active')) in ('active', 'approved', 'accepted')
  limit 1;
$$;

grant execute on function public.current_supervisor_assignment_manager_profile_id() to authenticated;

create or replace function public.admin_assign_student_supervisor_only(
  target_student_id uuid,
  target_supervisor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := public.current_supervisor_assignment_manager_profile_id();
  actor_role text := public.current_profile_role();
  v_student public.profiles%rowtype;
  v_supervisor public.profiles%rowtype;
begin
  if actor_id is null or lower(coalesce(actor_role, '')) not in ('admin', 'admin/editor', 'administrator', 'committee', 'research committee') then
    raise exception 'Only Admin or Research Committee users can assign or remove student supervisors.';
  end if;

  select * into v_student from public.profiles where id = target_student_id and lower(coalesce(role, '')) = 'student';
  if not found then
    raise exception 'Student account not found.';
  end if;

  if target_supervisor_id is not null then
    select * into v_supervisor from public.profiles where id = target_supervisor_id and lower(coalesce(role, '')) = 'supervisor';
    if not found then
      raise exception 'Supervisor account not found.';
    end if;

    update public.profiles
    set assigned_supervisor_id = v_supervisor.id,
        assigned_supervisor_email = coalesce(v_supervisor.email, ''),
        assigned_supervisor_name = coalesce(v_supervisor.full_name, ''),
        assigned_supervisor_email_sent_at = null,
        assigned_supervisor_email_supervisor_id = null,
        assigned_supervisor_email_supervisor_email = ''
    where id = v_student.id;

    return jsonb_build_object('ok', true, 'student_id', v_student.id, 'supervisor_id', v_supervisor.id, 'action', 'assigned', 'assigned_by', actor_id);
  end if;

  update public.profiles
  set assigned_supervisor_id = null,
      assigned_supervisor_email = '',
      assigned_supervisor_name = '',
      assigned_supervisor_email_sent_at = null,
      assigned_supervisor_email_supervisor_id = null,
      assigned_supervisor_email_supervisor_email = ''
  where id = v_student.id;

  return jsonb_build_object('ok', true, 'student_id', v_student.id, 'supervisor_id', null, 'action', 'removed', 'assigned_by', actor_id);
end;
$$;

grant execute on function public.admin_assign_student_supervisor_only(uuid, uuid) to authenticated;

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
  manager_id uuid;
  student_record public.profiles%rowtype;
  supervisor_record public.profiles%rowtype;
  same_supervisor boolean := false;
begin
  manager_id := public.current_supervisor_assignment_manager_profile_id();
  if manager_id is null then
    raise exception 'Only Admin or Research Committee users can assign or remove supervisors.';
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
    'supervisorId', case when target_supervisor_id is null then null else supervisor_record.id end,
    'assignedBy', manager_id
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
using (public.current_supervisor_assignment_manager_profile_id() is not null)
with check (public.current_supervisor_assignment_manager_profile_id() is not null);

drop policy if exists "projects_update_admin_assignment" on public.research_projects;
create policy "projects_update_admin_assignment"
on public.research_projects
for update
to authenticated
using (public.current_supervisor_assignment_manager_profile_id() is not null)
with check (public.current_supervisor_assignment_manager_profile_id() is not null);

commit;
