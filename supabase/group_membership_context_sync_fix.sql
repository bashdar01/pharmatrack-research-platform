-- Group/project membership consistency fix
-- Safe to run multiple times. It does not delete users or change roles.
-- Purpose: when a student is accepted/added into a research group, sync the official membership,
-- student profile group/supervisor fields, project students array, and accepted-request backfill.

create extension if not exists "uuid-ossp";

alter table public.profiles add column if not exists current_research_group_id uuid references public.research_projects(id) on delete set null;
alter table public.profiles add column if not exists current_research_group_name text;
alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;

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
  on public.research_group_members(group_id, student_id)
  where student_id is not null;
create unique index if not exists research_group_members_unique_group_student_email
  on public.research_group_members(group_id, lower(student_email))
  where student_email is not null and trim(student_email) <> '';

-- Plain unique indexes are kept for Supabase upsert(..., { onConflict }) compatibility.
create unique index if not exists research_group_members_unique_group_student_id_plain
  on public.research_group_members(group_id, student_id);
create unique index if not exists research_group_members_unique_group_student_email_plain
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

-- Admin and Research Committee can manage all memberships; supervisors only their own groups; students only read themselves.
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

-- Shared backend source of truth for official student group membership.
create or replace function public.sync_student_group_project_membership(
  target_student_id uuid,
  target_student_email text,
  target_group_id uuid,
  actor_profile_id uuid default null,
  via_request_id uuid default null,
  skip_permission_check boolean default false
)
returns public.research_group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_record public.profiles%rowtype;
  student_record public.profiles%rowtype;
  group_record public.research_projects%rowtype;
  member_record public.research_group_members%rowtype;
  member_id uuid;
  member_name text;
  member_email text;
  has_other_group boolean;
begin
  select * into group_record from public.research_projects where id = target_group_id;
  if group_record.id is null then
    raise exception 'Research group/project was not found.';
  end if;

  select * into student_record
  from public.profiles p
  where (target_student_id is not null and p.id = target_student_id)
     or (nullif(target_student_email,'') is not null and lower(p.email) = lower(target_student_email))
  limit 1;

  member_id := coalesce(student_record.id, target_student_id);
  member_name := coalesce(nullif(student_record.full_name, ''), nullif(target_student_email, ''), 'Student');
  member_email := nullif(coalesce(nullif(student_record.email, ''), nullif(target_student_email, ''), ''), '');

  if member_id is null and member_email is null then
    raise exception 'Student was not found.';
  end if;

  if not skip_permission_check then
    select * into actor_record
    from public.profiles p
    where p.id = coalesce(actor_profile_id, auth.uid())
       or lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1;

    if actor_record.id is null then
      raise exception 'Permission denied.';
    end if;

    if actor_record.role not in ('admin','committee') and not (
      actor_record.role = 'supervisor' and (
        group_record.supervisor_id = actor_record.id
        or lower(coalesce(group_record.supervisor_email,'')) = lower(actor_record.email)
        or lower(coalesce(group_record.supervisor_name,'')) = lower(actor_record.full_name)
      )
    ) then
      raise exception 'Permission denied.';
    end if;
  end if;

  -- Multiple groups are not allowed. Allow idempotent re-save into the same group only.
  select exists (
    select 1 from public.research_group_members rgm
    where rgm.status = 'Active'
      and rgm.group_id <> group_record.id
      and (
        (member_id is not null and rgm.student_id = member_id)
        or (member_email is not null and lower(coalesce(rgm.student_email,'')) = lower(member_email))
      )
  ) into has_other_group;

  if has_other_group then
    raise exception 'This student is already assigned to a research group.';
  end if;

  if member_id is not null then
    insert into public.research_group_members (
      group_id, project_id, student_id, student_email, student_name,
      supervisor_id, supervisor_email, supervisor_name,
      joined_via_request_id, status, joined_at, added_by
    ) values (
      group_record.id, group_record.id, member_id, member_email, member_name,
      group_record.supervisor_id, group_record.supervisor_email, group_record.supervisor_name,
      via_request_id, 'Active', now(), coalesce(actor_profile_id, auth.uid())
    )
    on conflict (group_id, student_id) do update set
      project_id = excluded.project_id,
      student_email = excluded.student_email,
      student_name = excluded.student_name,
      supervisor_id = excluded.supervisor_id,
      supervisor_email = excluded.supervisor_email,
      supervisor_name = excluded.supervisor_name,
      joined_via_request_id = coalesce(excluded.joined_via_request_id, public.research_group_members.joined_via_request_id),
      status = 'Active',
      added_by = excluded.added_by
    returning * into member_record;
  else
    select * into member_record
    from public.research_group_members rgm
    where rgm.group_id = group_record.id
      and lower(coalesce(rgm.student_email, '')) = lower(member_email)
    limit 1;

    if member_record.id is not null then
      update public.research_group_members
      set project_id = group_record.id,
          student_name = member_name,
          supervisor_id = group_record.supervisor_id,
          supervisor_email = group_record.supervisor_email,
          supervisor_name = group_record.supervisor_name,
          joined_via_request_id = coalesce(via_request_id, joined_via_request_id),
          status = 'Active',
          added_by = coalesce(actor_profile_id, auth.uid())
      where id = member_record.id
      returning * into member_record;
    else
      insert into public.research_group_members (
        group_id, project_id, student_email, student_name,
        supervisor_id, supervisor_email, supervisor_name,
        joined_via_request_id, status, joined_at, added_by
      ) values (
        group_record.id, group_record.id, member_email, member_name,
        group_record.supervisor_id, group_record.supervisor_email, group_record.supervisor_name,
        via_request_id, 'Active', now(), coalesce(actor_profile_id, auth.uid())
      )
      returning * into member_record;
    end if;
  end if;

  if member_id is not null then
    update public.profiles
    set current_research_group_id = group_record.id,
        current_research_group_name = coalesce(group_record.group_name, group_record.title, 'Research Group'),
        assigned_supervisor_id = coalesce(group_record.supervisor_id, assigned_supervisor_id),
        assigned_supervisor_email = coalesce(nullif(group_record.supervisor_email, ''), assigned_supervisor_email),
        assigned_supervisor_name = coalesce(nullif(group_record.supervisor_name, ''), assigned_supervisor_name)
    where id = member_id;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='group_id') then
      execute 'update public.profiles set group_id = $1 where id = $2' using group_record.id, member_id;
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='research_group_id') then
      execute 'update public.profiles set research_group_id = $1 where id = $2' using group_record.id, member_id;
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='project_id') then
      execute 'update public.profiles set project_id = $1 where id = $2' using group_record.id, member_id;
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='research_title_id') then
      execute 'update public.profiles set research_title_id = $1 where id = $2' using group_record.id, member_id;
    end if;
  end if;

  update public.research_projects
  set students = (
    select array(
      select distinct item
      from unnest(coalesce(students, array[]::text[]) || array[member_name, member_email]) as t(item)
      where item is not null and trim(item) <> ''
    )
  )
  where id = group_record.id;

  return member_record;
end;
$$;

grant execute on function public.sync_student_group_project_membership(uuid, text, uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.sync_accepted_group_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Accepted' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Accepted') then
    perform public.sync_student_group_project_membership(
      new.student_id,
      new.student_email,
      new.requested_group_id,
      new.decided_by,
      new.id,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists group_join_request_acceptance_sync on public.group_join_requests;
create trigger group_join_request_acceptance_sync
after insert or update of status on public.group_join_requests
for each row execute function public.sync_accepted_group_join_request();

-- Backfill all previously accepted requests into official membership and profile/project links.
update public.group_join_requests
set status = status
where status = 'Accepted';
