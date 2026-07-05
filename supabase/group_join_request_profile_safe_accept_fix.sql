-- Safe group join request accept/reject fix
-- Run this in Supabase SQL Editor.
-- Purpose:
-- 1) Fix: "Supervisor assignment cannot be changed from the profile page."
-- 2) Keep the profile-page safety trigger intact.
-- 3) Accept join requests by writing to safe membership tables, not protected profile supervisor fields.
-- 4) Support Supervisor, Research Committee, and Admin approvals.

create extension if not exists "uuid-ossp";

-- Required safe membership table. This table stores the group/project membership context
-- instead of changing protected supervisor-assignment fields on profiles.
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
  status text not null default 'Active',
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
alter table public.research_group_members add column if not exists status text not null default 'Active';
alter table public.research_group_members add column if not exists joined_at timestamptz default now();
alter table public.research_group_members add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.research_group_members add column if not exists created_at timestamptz default now();

create unique index if not exists research_group_members_unique_group_student_id
  on public.research_group_members(group_id, student_id)
  where student_id is not null;
create unique index if not exists research_group_members_unique_group_student_email
  on public.research_group_members(group_id, student_email)
  where student_email is not null;
create index if not exists research_group_members_group_idx on public.research_group_members(group_id);
create index if not exists research_group_members_student_idx on public.research_group_members(student_id, student_email);

-- Current actor helper for RPC permission checks.
create or replace function public.current_actor_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

grant execute on function public.current_actor_profile() to authenticated;

-- Permission helper: supervisor of the requested group, research committee, or admin.
create or replace function public.actor_can_manage_group_join(target_request public.group_join_requests, actor public.profiles)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(regexp_replace(coalesce(actor.role, ''), '[^a-z0-9]+', '', 'g')) in ('admin','committee','researchcommittee')
    or (
      lower(regexp_replace(coalesce(actor.role, ''), '[^a-z0-9]+', '', 'g')) = 'supervisor'
      and (
        target_request.supervisor_id = actor.id
        or lower(coalesce(target_request.supervisor_email, '')) = lower(coalesce(actor.email, ''))
        or exists (
          select 1 from public.research_projects rp
          where rp.id = target_request.requested_group_id
            and (
              rp.supervisor_id = actor.id
              or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(actor.email, ''))
              or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(actor.full_name, ''))
            )
        )
      )
    );
$$;

grant execute on function public.actor_can_manage_group_join(public.group_join_requests, public.profiles) to authenticated;

-- IMPORTANT FIX:
-- Replace the old acceptance sync trigger function that updated profiles.assigned_supervisor_*.
-- This version only writes to research_group_members and research_projects.students.
-- It intentionally does NOT update profiles.supervisor_id, profiles.assigned_supervisor_id,
-- profiles.project_supervisor_id, or any protected supervisor-assignment profile field.
create or replace function public.sync_accepted_group_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_record public.research_projects%rowtype;
  student_record public.profiles%rowtype;
  member_id uuid;
  member_email text;
  member_name text;
  member_names text[];
begin
  if coalesce(new.status, '') <> 'Accepted' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'Accepted' then
    return new;
  end if;

  select * into group_record
  from public.research_projects rp
  where rp.id = new.requested_group_id;

  if group_record.id is null then
    return new;
  end if;

  select * into student_record
  from public.profiles p
  where p.id = new.student_id
     or lower(coalesce(p.email, '')) = lower(coalesce(new.student_email, ''))
  limit 1;

  member_id := coalesce(student_record.id, new.student_id);
  member_email := nullif(coalesce(student_record.email, new.student_email), '');
  member_name := nullif(coalesce(student_record.full_name, new.student_name, student_record.email, new.student_email, 'Student'), '');

  if member_id is not null then
    update public.research_group_members rgm
       set project_id = group_record.id,
           student_email = member_email,
           student_name = member_name,
           supervisor_id = group_record.supervisor_id,
           supervisor_email = coalesce(group_record.supervisor_email, ''),
           supervisor_name = coalesce(group_record.supervisor_name, ''),
           joined_via_request_id = new.id,
           status = 'Active',
           added_by = coalesce(new.decided_by, rgm.added_by)
     where rgm.group_id = group_record.id
       and rgm.student_id = member_id;

    if not found then
      begin
        insert into public.research_group_members (
          group_id, project_id, student_id, student_email, student_name,
          supervisor_id, supervisor_email, supervisor_name,
          joined_via_request_id, status, joined_at, added_by
        ) values (
          group_record.id, group_record.id, member_id, member_email, member_name,
          group_record.supervisor_id, coalesce(group_record.supervisor_email, ''), coalesce(group_record.supervisor_name, ''),
          new.id, 'Active', coalesce(new.decided_at, now()), new.decided_by
        );
      exception when unique_violation then
        update public.research_group_members rgm
           set project_id = group_record.id,
               student_email = member_email,
               student_name = member_name,
               supervisor_id = group_record.supervisor_id,
               supervisor_email = coalesce(group_record.supervisor_email, ''),
               supervisor_name = coalesce(group_record.supervisor_name, ''),
               joined_via_request_id = new.id,
               status = 'Active',
               added_by = coalesce(new.decided_by, rgm.added_by)
         where rgm.group_id = group_record.id
           and rgm.student_id = member_id;
      end;
    end if;
  elsif member_email is not null then
    update public.research_group_members rgm
       set project_id = group_record.id,
           student_name = member_name,
           supervisor_id = group_record.supervisor_id,
           supervisor_email = coalesce(group_record.supervisor_email, ''),
           supervisor_name = coalesce(group_record.supervisor_name, ''),
           joined_via_request_id = new.id,
           status = 'Active',
           added_by = coalesce(new.decided_by, rgm.added_by)
     where rgm.group_id = group_record.id
       and lower(coalesce(rgm.student_email, '')) = lower(member_email);

    if not found then
      begin
        insert into public.research_group_members (
          group_id, project_id, student_email, student_name,
          supervisor_id, supervisor_email, supervisor_name,
          joined_via_request_id, status, joined_at, added_by
        ) values (
          group_record.id, group_record.id, member_email, member_name,
          group_record.supervisor_id, coalesce(group_record.supervisor_email, ''), coalesce(group_record.supervisor_name, ''),
          new.id, 'Active', coalesce(new.decided_at, now()), new.decided_by
        );
      exception when unique_violation then
        update public.research_group_members rgm
           set project_id = group_record.id,
               student_name = member_name,
               supervisor_id = group_record.supervisor_id,
               supervisor_email = coalesce(group_record.supervisor_email, ''),
               supervisor_name = coalesce(group_record.supervisor_name, ''),
               joined_via_request_id = new.id,
               status = 'Active',
               added_by = coalesce(new.decided_by, rgm.added_by)
         where rgm.group_id = group_record.id
           and lower(coalesce(rgm.student_email, '')) = lower(member_email);
      end;
    end if;
  end if;

  member_names := array_remove(array[member_name, member_email], null);

  update public.research_projects rp
     set students = coalesce((
       select array_agg(distinct item)
       from unnest(coalesce(rp.students, array[]::text[]) || member_names) as t(item)
       where nullif(btrim(item), '') is not null
     ), rp.students)
   where rp.id = group_record.id;

  return new;
end;
$$;

drop trigger if exists group_join_request_acceptance_sync on public.group_join_requests;
create trigger group_join_request_acceptance_sync
after insert or update of status on public.group_join_requests
for each row execute function public.sync_accepted_group_join_request();

grant execute on function public.sync_accepted_group_join_request() to authenticated;

-- Safe accept RPC. It marks the request accepted and relies on the safe trigger above
-- to create membership. It does not update protected profile supervisor fields.
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
  student_key_email text;
begin
  actor := public.current_actor_profile();
  if actor.id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into target
  from public.group_join_requests gjr
  where gjr.id = accept_group_join_request.request_id
  for update;

  if target.id is null then
    raise exception 'Group join request not found.';
  end if;

  if coalesce(target.status, 'Pending') <> 'Pending' then
    raise exception 'This request is already %.', target.status;
  end if;

  if not public.actor_can_manage_group_join(target, actor) then
    raise exception 'You do not have permission to manage this group join request.';
  end if;

  select * into target_group
  from public.research_projects rp
  where rp.id = target.requested_group_id;

  if target_group.id is null then
    raise exception 'Research group not found.';
  end if;

  select * into target_student
  from public.profiles p
  where p.id = target.student_id
     or lower(coalesce(p.email, '')) = lower(coalesce(target.student_email, ''))
  limit 1;

  student_key_email := lower(coalesce(target_student.email, target.student_email, ''));

  if exists (
    select 1 from public.research_group_members rgm
    where rgm.status = 'Active'
      and rgm.group_id <> target.requested_group_id
      and (
        (target_student.id is not null and rgm.student_id = target_student.id)
        or (student_key_email <> '' and lower(coalesce(rgm.student_email, '')) = student_key_email)
      )
  ) then
    raise exception 'This student is already assigned to a research group.';
  end if;

  update public.group_join_requests gjr
     set status = 'Accepted',
         decision_message = coalesce(accept_group_join_request.decision_message, ''),
         decided_at = now(),
         decided_by = actor.id,
         decided_by_name = coalesce(actor.full_name, actor.email, 'Reviewer')
   where gjr.id = accept_group_join_request.request_id
     and coalesce(gjr.status, 'Pending') = 'Pending';

  if not found then
    raise exception 'This request has already been decided.';
  end if;

  return jsonb_build_object('ok', true, 'status', 'Accepted', 'request_id', accept_group_join_request.request_id);
end;
$$;

-- Safe reject RPC. It only marks the request rejected and does not touch profiles.
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

  select * into target
  from public.group_join_requests gjr
  where gjr.id = reject_group_join_request.request_id
  for update;

  if target.id is null then
    raise exception 'Group join request not found.';
  end if;

  if coalesce(target.status, 'Pending') <> 'Pending' then
    raise exception 'This request is already %.', target.status;
  end if;

  if not public.actor_can_manage_group_join(target, actor) then
    raise exception 'You do not have permission to manage this group join request.';
  end if;

  update public.group_join_requests gjr
     set status = 'Rejected',
         decision_message = coalesce(reject_group_join_request.decision_message, ''),
         decided_at = now(),
         decided_by = actor.id,
         decided_by_name = coalesce(actor.full_name, actor.email, 'Reviewer')
   where gjr.id = reject_group_join_request.request_id
     and coalesce(gjr.status, 'Pending') = 'Pending';

  if not found then
    raise exception 'This request has already been decided.';
  end if;

  return jsonb_build_object('ok', true, 'status', 'Rejected', 'request_id', reject_group_join_request.request_id);
end;
$$;

grant execute on function public.accept_group_join_request(uuid, text) to authenticated;
grant execute on function public.reject_group_join_request(uuid, text) to authenticated;
