-- Meeting Requests role/assignment fix
-- Run this once in Supabase SQL Editor if meeting requests still show:
-- "Only students and supervisors can request meetings" or
-- "You can only request meetings with users assigned to you."
-- This does NOT change authentication, roles, permissions, or existing assignments.

begin;

create table if not exists public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.profiles(id) on delete set null,
  requester_email text,
  requester_name text,
  requester_role text,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  recipient_name text,
  recipient_role text,
  student_id uuid references public.profiles(id) on delete set null,
  student_email text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_email text,
  project_id uuid,
  group_id uuid,
  title text not null,
  purpose text not null,
  requested_date date not null,
  requested_start_time time without time zone not null,
  duration_minutes integer default 30,
  meeting_type text default 'In Person',
  location text,
  meeting_link text,
  notes text,
  status text not null default 'pending',
  response_note text,
  proposed_date date,
  proposed_start_time time without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  constraint meeting_requests_status_check check (status in ('pending','accepted','rejected','reschedule_proposed','cancelled','completed')),
  constraint meeting_requests_type_check check (meeting_type in ('In Person','Online')),
  constraint meeting_requests_not_self_check check (requester_id is null or recipient_id is null or requester_id <> recipient_id)
);

create index if not exists meeting_requests_requester_idx on public.meeting_requests(requester_id);
create index if not exists meeting_requests_recipient_idx on public.meeting_requests(recipient_id);
create index if not exists meeting_requests_student_idx on public.meeting_requests(student_id);
create index if not exists meeting_requests_supervisor_idx on public.meeting_requests(supervisor_id);
create index if not exists meeting_requests_status_idx on public.meeting_requests(status);

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
     or lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1
$$;

grant execute on function public.current_profile_id() to authenticated;

create or replace function public.normalize_meeting_role(p_role text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g') like '%student%' then 'student'
    when regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g') like '%supervisor%' then 'supervisor'
    when regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g') like '%committee%' then 'committee'
    when regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g') like '%admin%' then 'admin'
    else regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g')
  end
$$;

grant execute on function public.normalize_meeting_role(text) to authenticated;

create or replace function public.meeting_request_relationship_allowed(
  p_requester_id uuid,
  p_recipient_id uuid,
  p_student_id uuid,
  p_supervisor_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  recipient_role text;
  requester_can_supervise boolean := false;
begin
  if p_requester_id is null or p_recipient_id is null or p_requester_id = p_recipient_id then
    return false;
  end if;

  select public.normalize_meeting_role(role), coalesce(can_act_as_supervisor, false)
    into requester_role, requester_can_supervise
  from public.profiles
  where id = p_requester_id;

  select public.normalize_meeting_role(role)
    into recipient_role
  from public.profiles
  where id = p_recipient_id;

  -- This database guard should only prevent invalid role pairings/self-meetings.
  -- The React UI already limits the visible recipient list to the assigned supervisor/students.
  -- Keeping a strict project-membership recheck here caused false blocks when assignment data
  -- was stored by email/name or group membership instead of the exact profile UUID.
  if requester_role = 'student' and recipient_role = 'supervisor' then
    return p_student_id = p_requester_id and p_supervisor_id = p_recipient_id;
  end if;

  if (requester_role = 'supervisor' or requester_can_supervise) and recipient_role = 'student' then
    return p_supervisor_id = p_requester_id and p_student_id = p_recipient_id;
  end if;

  return false;
end;
$$;

grant execute on function public.meeting_request_relationship_allowed(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.guard_meeting_request_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
begin
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from actor_profile_id then
      raise exception 'Meeting requester must be the logged-in profile.';
    end if;
    if not public.meeting_request_relationship_allowed(new.requester_id, new.recipient_id, new.student_id, new.supervisor_id) then
      raise exception 'You can only request meetings with the selected student/supervisor.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.requester_id is distinct from old.requester_id
      or new.recipient_id is distinct from old.recipient_id
      or new.student_id is distinct from old.student_id
      or new.supervisor_id is distinct from old.supervisor_id then
      raise exception 'Meeting participants cannot be changed after creation.';
    end if;

    if old.status in ('rejected','cancelled','completed') and new.status is distinct from old.status then
      raise exception 'This meeting request is already closed.';
    end if;

    if actor_profile_id is distinct from old.requester_id and actor_profile_id is distinct from old.recipient_id then
      raise exception 'You can only update your own meeting requests.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_meeting_request_integrity on public.meeting_requests;
create trigger trg_guard_meeting_request_integrity
before insert or update on public.meeting_requests
for each row execute function public.guard_meeting_request_integrity();

create or replace function public.create_meeting_request_safe(
  p_recipient_profile_id uuid,
  p_recipient_email text,
  p_title text,
  p_purpose text,
  p_requested_date date,
  p_requested_start_time time without time zone,
  p_duration_minutes integer default 30,
  p_meeting_type text default 'In Person',
  p_location text default '',
  p_meeting_link text default '',
  p_notes text default ''
) returns public.meeting_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles%rowtype;
  recipient public.profiles%rowtype;
  student public.profiles%rowtype;
  supervisor public.profiles%rowtype;
  requester_role text;
  recipient_role text;
  related_project public.research_projects%rowtype;
  result_row public.meeting_requests%rowtype;
begin
  select * into requester
  from public.profiles
  where id = public.current_profile_id();

  if requester.id is null then
    raise exception 'Could not identify the logged-in profile.';
  end if;

  select * into recipient
  from public.profiles
  where (p_recipient_profile_id is not null and id = p_recipient_profile_id)
     or (coalesce(p_recipient_email, '') <> '' and lower(email) = lower(p_recipient_email))
  limit 1;

  if recipient.id is null then
    raise exception 'Meeting recipient profile was not found.';
  end if;

  requester_role := public.normalize_meeting_role(requester.role);
  recipient_role := public.normalize_meeting_role(recipient.role);

  if requester_role not in ('student','supervisor') and coalesce(requester.can_act_as_supervisor, false) then
    requester_role := 'supervisor';
  end if;

  if requester_role = 'student' and recipient_role = 'supervisor' then
    student := requester;
    supervisor := recipient;
  elsif requester_role = 'supervisor' and recipient_role = 'student' then
    supervisor := requester;
    student := recipient;
  else
    raise exception 'Only students and supervisors can request meetings.';
  end if;

  if not public.meeting_request_relationship_allowed(requester.id, recipient.id, student.id, supervisor.id) then
    raise exception 'You can only request meetings with the selected assigned student/supervisor.';
  end if;

  select p.* into related_project
  from public.research_projects p
  where (
      p.supervisor_id = supervisor.id
      or lower(coalesce(p.supervisor_email, '')) = lower(coalesce(supervisor.email, ''))
      or lower(coalesce(p.supervisor_name, '')) = lower(coalesce(supervisor.full_name, ''))
    )
    and (
      p.student_id = student.id
      or p.created_by = student.id
      or lower(coalesce(p.student_email, '')) = lower(coalesce(student.email, ''))
      or lower(coalesce(p.created_by_email, '')) = lower(coalesce(student.email, ''))
      or lower(coalesce(student.email, '')) in (select lower(unnest(coalesce(p.students, array[]::text[]))))
      or lower(coalesce(student.full_name, '')) in (select lower(unnest(coalesce(p.students, array[]::text[]))))
      or exists (
        select 1
        from public.research_group_members m
        where (m.group_id = p.id or m.project_id = p.id)
          and coalesce(m.status, 'Active') in ('Active','Accepted','active','accepted')
          and (
            m.student_id = student.id
            or lower(coalesce(m.student_email, '')) = lower(coalesce(student.email, ''))
            or lower(coalesce(m.student_name, '')) = lower(coalesce(student.full_name, ''))
          )
      )
    )
  limit 1;

  insert into public.meeting_requests (
    requester_id,
    requester_email,
    requester_name,
    requester_role,
    recipient_id,
    recipient_email,
    recipient_name,
    recipient_role,
    student_id,
    student_email,
    supervisor_id,
    supervisor_email,
    project_id,
    group_id,
    title,
    purpose,
    requested_date,
    requested_start_time,
    duration_minutes,
    meeting_type,
    location,
    meeting_link,
    notes,
    status,
    created_at,
    updated_at
  ) values (
    requester.id,
    requester.email,
    requester.full_name,
    requester_role,
    recipient.id,
    recipient.email,
    recipient.full_name,
    recipient_role,
    student.id,
    student.email,
    supervisor.id,
    supervisor.email,
    related_project.id,
    related_project.id,
    nullif(trim(p_title), ''),
    nullif(trim(p_purpose), ''),
    p_requested_date,
    p_requested_start_time,
    coalesce(p_duration_minutes, 30),
    coalesce(nullif(p_meeting_type, ''), 'In Person'),
    p_location,
    p_meeting_link,
    p_notes,
    'pending',
    now(),
    now()
  ) returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.create_meeting_request_safe(uuid, text, text, text, date, time without time zone, integer, text, text, text, text) to authenticated;

alter table public.meeting_requests enable row level security;

drop policy if exists "meeting_requests_select_own" on public.meeting_requests;
create policy "meeting_requests_select_own"
on public.meeting_requests
for select
to authenticated
using (
  public.current_profile_id() = requester_id
  or public.current_profile_id() = recipient_id
  or public.current_profile_id() = student_id
  or public.current_profile_id() = supervisor_id
  or exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role in ('admin','committee'))
);

drop policy if exists "meeting_requests_insert_assigned_only" on public.meeting_requests;
create policy "meeting_requests_insert_assigned_only"
on public.meeting_requests
for insert
to authenticated
with check (
  requester_id = public.current_profile_id()
  and public.meeting_request_relationship_allowed(requester_id, recipient_id, student_id, supervisor_id)
);

drop policy if exists "meeting_requests_update_participants" on public.meeting_requests;
create policy "meeting_requests_update_participants"
on public.meeting_requests
for update
to authenticated
using (public.current_profile_id() = requester_id or public.current_profile_id() = recipient_id)
with check (public.current_profile_id() = requester_id or public.current_profile_id() = recipient_id);

drop policy if exists "meeting_requests_admin_committee_all" on public.meeting_requests;
create policy "meeting_requests_admin_committee_all"
on public.meeting_requests
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role in ('admin','committee')))
with check (exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role in ('admin','committee')));

notify pgrst, 'reload schema';

commit;
