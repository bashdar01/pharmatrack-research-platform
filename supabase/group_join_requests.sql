-- Research group join request system
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

alter table public.profiles add column if not exists current_research_group_id uuid references public.research_projects(id) on delete set null;
alter table public.profiles add column if not exists current_research_group_name text;

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

alter table public.group_join_requests add column if not exists student_email text;
alter table public.group_join_requests add column if not exists student_name text;
alter table public.group_join_requests add column if not exists requested_group_name text;
alter table public.group_join_requests add column if not exists requested_project_title text;
alter table public.group_join_requests add column if not exists current_group_id uuid references public.research_projects(id) on delete set null;
alter table public.group_join_requests add column if not exists current_group_name text;
alter table public.group_join_requests add column if not exists supervisor_email text;
alter table public.group_join_requests add column if not exists supervisor_name text;
alter table public.group_join_requests add column if not exists request_message text;
alter table public.group_join_requests add column if not exists decision_message text;
alter table public.group_join_requests add column if not exists requested_at timestamptz default now();
alter table public.group_join_requests add column if not exists decided_at timestamptz;
alter table public.group_join_requests add column if not exists decided_by uuid references public.profiles(id) on delete set null;
alter table public.group_join_requests add column if not exists decided_by_name text;
alter table public.group_join_requests add column if not exists decision_email_sent_at timestamptz;
alter table public.group_join_requests add column if not exists created_at timestamptz default now();

create index if not exists group_join_requests_student_idx on public.group_join_requests(student_id, student_email);
create index if not exists group_join_requests_group_idx on public.group_join_requests(requested_group_id);
create index if not exists group_join_requests_status_idx on public.group_join_requests(status);
create unique index if not exists group_join_requests_unique_pending_student_group
  on public.group_join_requests(student_id, requested_group_id)
  where status = 'Pending' and student_id is not null and requested_group_id is not null;

alter table public.group_join_requests enable row level security;

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

drop policy if exists "group_requests_select_allowed" on public.group_join_requests;
create policy "group_requests_select_allowed" on public.group_join_requests
for select to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'admin'
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

drop policy if exists "group_requests_insert_student_own" on public.group_join_requests;
create policy "group_requests_insert_student_own" on public.group_join_requests
for insert to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
      and (group_join_requests.student_id = p.id or lower(coalesce(group_join_requests.student_email,'')) = lower(p.email))
      and group_join_requests.status = 'Pending'
  )
);

drop policy if exists "group_requests_update_admin_or_group_supervisor" on public.group_join_requests;
create policy "group_requests_update_admin_or_group_supervisor" on public.group_join_requests
for update to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'admin'
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
    where p.role = 'admin'
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

-- Optional helper used by admins/support to verify requests.
create or replace view public.group_join_request_summary as
select
  gjr.*,
  rp.title as requested_project_title_live,
  rp.group_name as requested_group_name_live,
  p.full_name as student_full_name_live,
  p.email as student_email_live
from public.group_join_requests gjr
left join public.research_projects rp on rp.id = gjr.requested_group_id
left join public.profiles p on p.id = gjr.student_id;

-- Allow students to view available research projects/groups for the Join Research Group page.
-- Existing role-scoped project policies still control editing; this only grants read access.
drop policy if exists "projects_select_student_joinable_groups" on public.research_projects;
create policy "projects_select_student_joinable_groups"
on public.research_projects
for select
to authenticated
using (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
  )
);

-- Group membership/project partner fix after accepting join requests.
-- Safe to run multiple times.

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
alter table public.research_group_members add column if not exists status text not null default 'Active';
alter table public.research_group_members add column if not exists joined_at timestamptz default now();
alter table public.research_group_members add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.research_group_members add column if not exists created_at timestamptz default now();

drop index if exists public.research_group_members_unique_group_student_id;
drop index if exists public.research_group_members_unique_group_student_email;

create unique index if not exists research_group_members_unique_group_student_id
  on public.research_group_members(group_id, student_id);
create unique index if not exists research_group_members_unique_group_student_email
  on public.research_group_members(group_id, student_email);
create index if not exists research_group_members_group_idx on public.research_group_members(group_id);
create index if not exists research_group_members_student_idx on public.research_group_members(student_id, student_email);
create index if not exists research_group_members_supervisor_idx on public.research_group_members(supervisor_id, supervisor_email);

alter table public.research_group_members enable row level security;

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
    where p.role = 'admin'
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
    where p.role = 'admin'
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
    where p.role = 'admin'
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

create or replace function public.sync_accepted_group_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_record public.profiles%rowtype;
  group_record public.research_projects%rowtype;
  member_name text;
  member_email text;
  member_id uuid;
begin
  if new.status = 'Accepted' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Accepted') then
    select * into student_record
    from public.profiles p
    where (new.student_id is not null and p.id = new.student_id)
       or (nullif(new.student_email, '') is not null and lower(p.email) = lower(new.student_email))
    limit 1;

    select * into group_record
    from public.research_projects rp
    where rp.id = new.requested_group_id
    limit 1;

    if group_record.id is null then
      return new;
    end if;

    member_id := coalesce(student_record.id, new.student_id);
    member_name := coalesce(nullif(student_record.full_name, ''), nullif(new.student_name, ''), nullif(new.student_email, ''), 'Student');
    member_email := nullif(coalesce(nullif(student_record.email, ''), nullif(new.student_email, ''), ''), '');

    if member_id is not null then
      insert into public.research_group_members (
        group_id, project_id, student_id, student_email, student_name,
        supervisor_id, supervisor_email, supervisor_name,
        joined_via_request_id, status, joined_at, added_by
      ) values (
        group_record.id, group_record.id, member_id, member_email, member_name,
        group_record.supervisor_id, group_record.supervisor_email, group_record.supervisor_name,
        new.id, 'Active', coalesce(new.decided_at, now()), new.decided_by
      )
      on conflict (group_id, student_id) do update set
        project_id = excluded.project_id,
        student_email = excluded.student_email,
        student_name = excluded.student_name,
        supervisor_id = excluded.supervisor_id,
        supervisor_email = excluded.supervisor_email,
        supervisor_name = excluded.supervisor_name,
        joined_via_request_id = excluded.joined_via_request_id,
        status = 'Active',
        joined_at = coalesce(public.research_group_members.joined_at, excluded.joined_at),
        added_by = excluded.added_by;
    elsif member_email is not null then
      insert into public.research_group_members (
        group_id, project_id, student_email, student_name,
        supervisor_id, supervisor_email, supervisor_name,
        joined_via_request_id, status, joined_at, added_by
      ) values (
        group_record.id, group_record.id, member_email, member_name,
        group_record.supervisor_id, group_record.supervisor_email, group_record.supervisor_name,
        new.id, 'Active', coalesce(new.decided_at, now()), new.decided_by
      )
      on conflict (group_id, student_email) do update set
        project_id = excluded.project_id,
        student_name = excluded.student_name,
        supervisor_id = excluded.supervisor_id,
        supervisor_email = excluded.supervisor_email,
        supervisor_name = excluded.supervisor_name,
        joined_via_request_id = excluded.joined_via_request_id,
        status = 'Active',
        joined_at = coalesce(public.research_group_members.joined_at, excluded.joined_at),
        added_by = excluded.added_by;
    end if;

    if member_id is not null then
      update public.profiles
      set current_research_group_id = group_record.id,
          current_research_group_name = coalesce(group_record.group_name, group_record.title, 'Research Group'),
          assigned_supervisor_id = coalesce(group_record.supervisor_id, assigned_supervisor_id),
          assigned_supervisor_email = coalesce(nullif(group_record.supervisor_email, ''), assigned_supervisor_email),
          assigned_supervisor_name = coalesce(nullif(group_record.supervisor_name, ''), assigned_supervisor_name)
      where id = member_id;
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
  end if;

  return new;
end;
$$;

drop trigger if exists group_join_request_acceptance_sync on public.group_join_requests;
create trigger group_join_request_acceptance_sync
after insert or update of status on public.group_join_requests
for each row execute function public.sync_accepted_group_join_request();

-- Backfill official memberships from already accepted requests.
update public.group_join_requests
set status = status
where status = 'Accepted';

-- Broaden project/report matching so accepted group members identified by email can submit and be reviewed.
create or replace function public.report_matches_project_student(
  report_student_id uuid,
  report_submitted_by_id uuid,
  report_user_id uuid,
  report_created_by uuid,
  report_student_email text,
  report_submitted_by_email text,
  report_created_by_email text,
  report_submitted_by text,
  project_student_id uuid,
  project_created_by uuid,
  project_student_email text,
  project_created_by_email text,
  project_students text[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      project_student_id is not null and (
        report_student_id = project_student_id
        or report_submitted_by_id = project_student_id
        or report_user_id = project_student_id
        or report_created_by = project_student_id
      )
    )
    or (
      project_created_by is not null and (
        report_student_id = project_created_by
        or report_submitted_by_id = project_created_by
        or report_user_id = project_created_by
        or report_created_by = project_created_by
      )
    )
    or (
      nullif(lower(coalesce(project_student_email, '')), '') is not null and (
        lower(coalesce(report_student_email, '')) = lower(project_student_email)
        or lower(coalesce(report_submitted_by_email, '')) = lower(project_student_email)
        or lower(coalesce(report_created_by_email, '')) = lower(project_student_email)
      )
    )
    or (
      nullif(lower(coalesce(project_created_by_email, '')), '') is not null and (
        lower(coalesce(report_student_email, '')) = lower(project_created_by_email)
        or lower(coalesce(report_submitted_by_email, '')) = lower(project_created_by_email)
        or lower(coalesce(report_created_by_email, '')) = lower(project_created_by_email)
      )
    )
    or (
      lower(coalesce(report_submitted_by, '')) in (
        select lower(unnest(coalesce(project_students, array[]::text[])))
      )
    )
    or (
      lower(coalesce(report_student_email, '')) in (
        select lower(unnest(coalesce(project_students, array[]::text[])))
      )
    )
    or (
      lower(coalesce(report_submitted_by_email, '')) in (
        select lower(unnest(coalesce(project_students, array[]::text[])))
      )
    )
    or (
      lower(coalesce(report_created_by_email, '')) in (
        select lower(unnest(coalesce(project_students, array[]::text[])))
      )
    ),
    false
  );
$$;

grant execute on function public.sync_accepted_group_join_request() to authenticated;
grant execute on function public.report_matches_project_student(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, text, text, text[]) to authenticated;

-- Hide/disable Join Research Group for students who already have an active group.
-- Backend protection: reject new join requests from already-assigned students.
create or replace function public.student_has_active_research_group_for_request(
  check_student_id uuid,
  check_student_email text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where (
      (check_student_id is not null and p.id = check_student_id)
      or (nullif(check_student_email, '') is not null and lower(p.email) = lower(check_student_email))
    )
    and (
      p.current_research_group_id is not null
      or nullif(trim(coalesce(p.current_research_group_name, '')), '') is not null
    )
  )
  or exists (
    select 1
    from public.research_group_members rgm
    where coalesce(rgm.status, 'Active') = 'Active'
      and (
        (check_student_id is not null and rgm.student_id = check_student_id)
        or (nullif(check_student_email, '') is not null and lower(coalesce(rgm.student_email, '')) = lower(check_student_email))
      )
  )
  or exists (
    select 1
    from public.group_join_requests gjr
    where gjr.status = 'Accepted'
      and (
        (check_student_id is not null and gjr.student_id = check_student_id)
        or (nullif(check_student_email, '') is not null and lower(coalesce(gjr.student_email, '')) = lower(check_student_email))
      )
  );
$$;

create or replace function public.prevent_group_join_request_for_assigned_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'Pending') = 'Pending'
     and public.student_has_active_research_group_for_request(new.student_id, new.student_email) then
    raise exception 'You are already assigned to a research group.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_group_join_request_for_assigned_student_trigger on public.group_join_requests;
create trigger prevent_group_join_request_for_assigned_student_trigger
before insert on public.group_join_requests
for each row execute function public.prevent_group_join_request_for_assigned_student();

-- Recreate the student insert policy after research_group_members exists, so RLS also blocks assigned students.
drop policy if exists "group_requests_insert_student_own" on public.group_join_requests;
create policy "group_requests_insert_student_own" on public.group_join_requests
for insert to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
      and (group_join_requests.student_id = p.id or lower(coalesce(group_join_requests.student_email,'')) = lower(p.email))
      and group_join_requests.status = 'Pending'
      and p.current_research_group_id is null
      and nullif(trim(coalesce(p.current_research_group_name, '')), '') is null
      and not exists (
        select 1 from public.research_group_members rgm
        where coalesce(rgm.status, 'Active') = 'Active'
          and (rgm.student_id = p.id or lower(coalesce(rgm.student_email,'')) = lower(p.email))
      )
  )
);

grant execute on function public.student_has_active_research_group_for_request(uuid, text) to authenticated;
grant execute on function public.prevent_group_join_request_for_assigned_student() to authenticated;
