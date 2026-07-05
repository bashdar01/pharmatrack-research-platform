-- Fix: Supabase RPC error "column reference decision_message is ambiguous"
-- Run this after the previous decision_and_group_join_safety_fix.sql if join approval shows that error.

create or replace function public.accept_group_join_request(request_id uuid, decision_message text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  target public.group_join_requests;
  target_group public.research_projects;
  target_student public.profiles;
  member_names text[];
begin
  actor := public.current_actor_profile();
  if actor.id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into target from public.group_join_requests gjr where gjr.id = accept_group_join_request.request_id for update;
  if target.id is null then
    raise exception 'Group join request not found.';
  end if;
  if target.status <> 'Pending' then
    raise exception 'This request is already %.', target.status;
  end if;
  if not public.actor_can_manage_group_join(target, actor) then
    raise exception 'You do not have permission to manage this group join request.';
  end if;

  select * into target_group from public.research_projects rp where rp.id = target.requested_group_id;
  if target_group.id is null then
    raise exception 'Research group not found.';
  end if;

  select * into target_student from public.profiles p
  where p.id = target.student_id
     or lower(coalesce(p.email,'')) = lower(coalesce(target.student_email,''))
  limit 1;

  if exists (
    select 1 from public.research_group_members rgm
    where rgm.status = 'Active'
      and (target_student.id is not null and rgm.student_id = target_student.id or lower(coalesce(rgm.student_email,'')) = lower(coalesce(target.student_email, target_student.email, '')))
      and rgm.group_id <> target.requested_group_id
  ) then
    raise exception 'This student is already assigned to a research group.';
  end if;

  update public.group_join_requests
     set status = 'Accepted',
         decision_message = coalesce(accept_group_join_request.decision_message, ''),
         decided_at = now(),
         decided_by = actor.id,
         decided_by_name = coalesce(actor.full_name, actor.email, 'Reviewer')
   where public.group_join_requests.id = accept_group_join_request.request_id and public.group_join_requests.status = 'Pending';

  member_names := array_remove(array[
    nullif(coalesce(target_student.full_name, target.student_name), ''),
    nullif(coalesce(target_student.email, target.student_email), '')
  ], null);

  update public.research_projects rp
     set students = (
       select array_agg(distinct item)
       from unnest(coalesce(rp.students, array[]::text[]) || member_names) as item
       where nullif(btrim(item), '') is not null
     )
   where rp.id = target.requested_group_id;

  if target_student.id is not null then
    insert into public.research_group_members (
      group_id, project_id, student_id, student_email, student_name,
      supervisor_id, supervisor_email, supervisor_name,
      joined_via_request_id, status, joined_at, added_by
    ) values (
      target.requested_group_id, target.requested_group_id, target_student.id,
      coalesce(target_student.email, target.student_email), coalesce(target_student.full_name, target.student_name, target_student.email, 'Student'),
      coalesce(target_group.supervisor_id, target.supervisor_id), coalesce(target_group.supervisor_email, target.supervisor_email, ''), coalesce(target_group.supervisor_name, target.supervisor_name, ''),
      target.id, 'Active', now(), actor.id
    )
    on conflict (group_id, student_id) where student_id is not null do update set
      status = 'Active',
      student_email = excluded.student_email,
      student_name = excluded.student_name,
      supervisor_id = excluded.supervisor_id,
      supervisor_email = excluded.supervisor_email,
      supervisor_name = excluded.supervisor_name,
      joined_via_request_id = excluded.joined_via_request_id;
  else
    insert into public.research_group_members (
      group_id, project_id, student_id, student_email, student_name,
      supervisor_id, supervisor_email, supervisor_name,
      joined_via_request_id, status, joined_at, added_by
    ) values (
      target.requested_group_id, target.requested_group_id, null,
      target.student_email, coalesce(target.student_name, target.student_email, 'Student'),
      coalesce(target_group.supervisor_id, target.supervisor_id), coalesce(target_group.supervisor_email, target.supervisor_email, ''), coalesce(target_group.supervisor_name, target.supervisor_name, ''),
      target.id, 'Active', now(), actor.id
    )
    on conflict (group_id, student_email) where student_email is not null do update set
      status = 'Active',
      student_name = excluded.student_name,
      supervisor_id = excluded.supervisor_id,
      supervisor_email = excluded.supervisor_email,
      supervisor_name = excluded.supervisor_name,
      joined_via_request_id = excluded.joined_via_request_id;
  end if;

  return jsonb_build_object('ok', true, 'status', 'Accepted', 'request_id', accept_group_join_request.request_id);
end;
$$;

create or replace function public.reject_group_join_request(request_id uuid, decision_message text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  target public.group_join_requests;
begin
  actor := public.current_actor_profile();
  if actor.id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into target from public.group_join_requests gjr where gjr.id = reject_group_join_request.request_id for update;
  if target.id is null then
    raise exception 'Group join request not found.';
  end if;
  if target.status <> 'Pending' then
    raise exception 'This request is already %.', target.status;
  end if;
  if not public.actor_can_manage_group_join(target, actor) then
    raise exception 'You do not have permission to manage this group join request.';
  end if;

  update public.group_join_requests
     set status = 'Rejected',
         decision_message = coalesce(reject_group_join_request.decision_message, ''),
         decided_at = now(),
         decided_by = actor.id,
         decided_by_name = coalesce(actor.full_name, actor.email, 'Reviewer')
   where public.group_join_requests.id = reject_group_join_request.request_id and public.group_join_requests.status = 'Pending';

  return jsonb_build_object('ok', true, 'status', 'Rejected', 'request_id', reject_group_join_request.request_id);
end;
$$;

grant execute on function public.accept_group_join_request(uuid, text) to authenticated;
grant execute on function public.reject_group_join_request(uuid, text) to authenticated;
grant execute on function public.actor_can_manage_group_join(public.group_join_requests, public.profiles) to authenticated;
