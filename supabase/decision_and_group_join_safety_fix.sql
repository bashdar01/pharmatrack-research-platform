-- Decision button / one-time decision / safe group join approval fix
-- Safe to run multiple times in Supabase SQL Editor.
-- This does not change authentication, accounts, or roles.

create extension if not exists "uuid-ossp";

alter table public.weekly_reports add column if not exists status text;
alter table public.weekly_reports add column if not exists supervisor_feedback text;
alter table public.research_projects add column if not exists approval text;
alter table public.research_projects add column if not exists status text;
alter table public.research_projects add column if not exists committee_comments text;
alter table public.research_projects add column if not exists decision_message text;
alter table public.research_projects add column if not exists reviewed_at timestamptz;
alter table public.research_projects add column if not exists reviewed_by uuid;
alter table public.research_projects add column if not exists reviewed_by_name text;

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

create or replace function public.current_actor_profile()
returns public.profiles
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

grant execute on function public.current_actor_profile() to authenticated;

create or replace function public.weekly_report_final_status(status_value text)
returns boolean
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(status_value, ''), '[^a-z0-9]+', '', 'g')) in
    ('accepted','rejected','revisionrequired','revisionrequested','needsrevision');
$$;

create or replace function public.project_final_decision_key(approval_value text, status_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(regexp_replace(coalesce(approval_value, ''), '[^a-z0-9]+', '', 'g')) in ('approved','accepted') then 'accepted'
    when lower(regexp_replace(coalesce(approval_value, ''), '[^a-z0-9]+', '', 'g')) = 'rejected' then 'rejected'
    when lower(regexp_replace(coalesce(approval_value, ''), '[^a-z0-9]+', '', 'g')) in ('revisionrequired','revisionrequested','needsrevision') then 'revision'
    when lower(regexp_replace(coalesce(status_value, ''), '[^a-z0-9]+', '', 'g')) = 'rejected' then 'rejected'
    when lower(regexp_replace(coalesce(status_value, ''), '[^a-z0-9]+', '', 'g')) in ('needsattention','revisionrequired','revisionrequested','needsrevision') then 'revision'
    when lower(regexp_replace(coalesce(status_value, ''), '[^a-z0-9]+', '', 'g')) = 'ongoing'
      and lower(regexp_replace(coalesce(approval_value, ''), '[^a-z0-9]+', '', 'g')) in ('approved','accepted') then 'accepted'
    else 'pending'
  end;
$$;

create or replace function public.block_weekly_report_final_decision_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and public.weekly_report_final_status(old.status)
     and coalesce(new.status, '') is distinct from coalesce(old.status, '') then
    raise exception 'This weekly report has already received a final decision.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_weekly_report_final_decision_change on public.weekly_reports;
create trigger trg_block_weekly_report_final_decision_change
before update on public.weekly_reports
for each row execute function public.block_weekly_report_final_decision_change();

create or replace function public.block_research_project_final_decision_change()
returns trigger
language plpgsql
as $$
declare
  old_key text;
  new_key text;
begin
  old_key := public.project_final_decision_key(old.approval, old.status);
  new_key := public.project_final_decision_key(new.approval, new.status);
  if tg_op = 'UPDATE'
     and old_key in ('accepted','rejected','revision')
     and new_key is distinct from old_key then
    raise exception 'This title submission has already received a final decision.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_research_project_final_decision_change on public.research_projects;
create trigger trg_block_research_project_final_decision_change
before update on public.research_projects
for each row execute function public.block_research_project_final_decision_change();

-- Allow research committee to see/update group join requests and insert group members.
drop policy if exists "group_requests_select_allowed_with_committee" on public.group_join_requests;
create policy "group_requests_select_allowed_with_committee" on public.group_join_requests
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

drop policy if exists "group_requests_update_admin_committee_or_group_supervisor" on public.group_join_requests;
create policy "group_requests_update_admin_committee_or_group_supervisor" on public.group_join_requests
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

alter table public.research_group_members enable row level security;

drop policy if exists "research_group_members_select_allowed_with_committee" on public.research_group_members;
create policy "research_group_members_select_allowed_with_committee" on public.research_group_members
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

drop policy if exists "research_group_members_insert_allowed_with_committee" on public.research_group_members;
create policy "research_group_members_insert_allowed_with_committee" on public.research_group_members
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

create or replace function public.actor_can_manage_group_join(target_request public.group_join_requests, actor public.profiles)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select actor.role in ('admin','committee')
    or (
      actor.role = 'supervisor'
      and (
        target_request.supervisor_id = actor.id
        or lower(coalesce(target_request.supervisor_email,'')) = lower(actor.email)
        or exists (
          select 1 from public.research_projects rp
          where rp.id = target_request.requested_group_id
            and (rp.supervisor_id = actor.id or lower(coalesce(rp.supervisor_email,'')) = lower(actor.email) or lower(coalesce(rp.supervisor_name,'')) = lower(actor.full_name))
        )
      )
    );
$$;

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
