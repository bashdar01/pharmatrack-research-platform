-- Admin Supervisor Management tab backend helpers
-- Safe/idempotent. Adds a student-only supervisor assignment RPC and guards direct profile assignment updates.

begin;

alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;
alter table public.profiles add column if not exists assigned_supervisor_email_sent_at timestamptz;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email_supervisor_email text;

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
  actor_id uuid := public.current_profile_id();
  actor_role text := public.current_profile_role();
  v_student public.profiles%rowtype;
  v_supervisor public.profiles%rowtype;
begin
  if actor_id is null or actor_role <> 'admin' then
    raise exception 'Only admin can assign or remove student supervisors.';
  end if;

  select * into v_student from public.profiles where id = target_student_id and role = 'student';
  if not found then
    raise exception 'Student account not found.';
  end if;

  if target_supervisor_id is not null then
    select * into v_supervisor from public.profiles where id = target_supervisor_id and role = 'supervisor';
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

    return jsonb_build_object('ok', true, 'student_id', v_student.id, 'supervisor_id', v_supervisor.id, 'action', 'assigned');
  end if;

  update public.profiles
  set assigned_supervisor_id = null,
      assigned_supervisor_email = '',
      assigned_supervisor_name = '',
      assigned_supervisor_email_sent_at = null,
      assigned_supervisor_email_supervisor_id = null,
      assigned_supervisor_email_supervisor_email = ''
  where id = v_student.id;

  return jsonb_build_object('ok', true, 'student_id', v_student.id, 'supervisor_id', null, 'action', 'removed');
end;
$$;

grant execute on function public.admin_assign_student_supervisor_only(uuid, uuid) to authenticated;

create or replace function public.guard_student_supervisor_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_profile_role();
  actor_id uuid := public.current_profile_id();
  actor_email text := public.current_profile_email();
  assignment_changed boolean;
  supervisor_matches_actor boolean;
  supervisor_has_member_context boolean;
begin
  assignment_changed :=
    new.assigned_supervisor_id is distinct from old.assigned_supervisor_id
    or coalesce(new.assigned_supervisor_email, '') is distinct from coalesce(old.assigned_supervisor_email, '')
    or coalesce(new.assigned_supervisor_name, '') is distinct from coalesce(old.assigned_supervisor_name, '')
    or new.assigned_supervisor_email_sent_at is distinct from old.assigned_supervisor_email_sent_at
    or new.assigned_supervisor_email_supervisor_id is distinct from old.assigned_supervisor_email_supervisor_id
    or coalesce(new.assigned_supervisor_email_supervisor_email, '') is distinct from coalesce(old.assigned_supervisor_email_supervisor_email, '');

  if not assignment_changed then
    return new;
  end if;

  -- Supabase Edge Functions that use the service role key already perform their own permission checks.
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if actor_role in ('admin', 'committee') then
    return new;
  end if;

  supervisor_matches_actor := actor_role = 'supervisor' and (
    (new.assigned_supervisor_id is not null and new.assigned_supervisor_id = actor_id)
    or lower(coalesce(new.assigned_supervisor_email, '')) = lower(coalesce(actor_email, ''))
  );

  if supervisor_matches_actor then
    select exists (
      select 1
      from public.research_group_members rgm
      left join public.research_projects rp on rp.id = rgm.group_id or rp.id = rgm.project_id
      where rgm.status = 'Active'
        and (
          rgm.student_id = new.id
          or lower(coalesce(rgm.student_email, '')) = lower(coalesce(new.email, ''))
        )
        and (
          rgm.supervisor_id = actor_id
          or lower(coalesce(rgm.supervisor_email, '')) = lower(coalesce(actor_email, ''))
          or rp.supervisor_id = actor_id
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(actor_email, ''))
        )
    ) into supervisor_has_member_context;

    if supervisor_has_member_context then
      return new;
    end if;
  end if;

  raise exception 'Only admin can change direct student-supervisor assignments.';
end;
$$;

drop trigger if exists guard_student_supervisor_assignment_update on public.profiles;
create trigger guard_student_supervisor_assignment_update
before update of assigned_supervisor_id, assigned_supervisor_email, assigned_supervisor_name, assigned_supervisor_email_sent_at, assigned_supervisor_email_supervisor_id, assigned_supervisor_email_supervisor_email
on public.profiles
for each row
execute function public.guard_student_supervisor_assignment_update();

commit;
