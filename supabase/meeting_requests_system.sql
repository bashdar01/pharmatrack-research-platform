-- Meeting Requests system for College of Pharmacy Research Platform
-- Adds one meeting request table and safe RLS validation.
-- Does not change auth, roles, profiles, or supervisor assignment fields.

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
  ok boolean := false;
  tmp_count int := 0;
begin
  if p_requester_id is null or p_recipient_id is null or p_requester_id = p_recipient_id then
    return false;
  end if;

  select role into requester_role from public.profiles where id = p_requester_id;
  select role into recipient_role from public.profiles where id = p_recipient_id;

  if requester_role = 'student' and recipient_role = 'supervisor' then
    if p_student_id is distinct from p_requester_id or p_supervisor_id is distinct from p_recipient_id then
      return false;
    end if;

    -- Direct assignment fields are read only here; they are not updated.
    select count(*) into tmp_count
    from public.profiles s
    join public.profiles sup on sup.id = p_recipient_id
    where s.id = p_requester_id
      and (
        s.assigned_supervisor_id = sup.id
        or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(sup.email, ''))
        or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(sup.full_name, ''))
      );
    if tmp_count > 0 then
      return true;
    end if;

    if to_regclass('public.research_group_members') is not null and to_regclass('public.research_projects') is not null then
      execute $q$
        select count(*)
        from public.research_group_members m
        join public.research_projects p on p.id = coalesce(m.project_id, m.group_id)
        where m.student_id = $1
          and coalesce(m.status, 'Active') in ('Active','Accepted','active','accepted')
          and (p.supervisor_id = $2 or lower(coalesce(p.supervisor_email, '')) = lower((select email from public.profiles where id = $2)))
      $q$ into tmp_count using p_requester_id, p_recipient_id;
      if tmp_count > 0 then return true; end if;
    end if;

    return false;
  end if;

  if requester_role = 'supervisor' and recipient_role = 'student' then
    if p_supervisor_id is distinct from p_requester_id or p_student_id is distinct from p_recipient_id then
      return false;
    end if;

    select count(*) into tmp_count
    from public.profiles s
    join public.profiles sup on sup.id = p_requester_id
    where s.id = p_recipient_id
      and (
        s.assigned_supervisor_id = sup.id
        or lower(coalesce(s.assigned_supervisor_email, '')) = lower(coalesce(sup.email, ''))
        or lower(coalesce(s.assigned_supervisor_name, '')) = lower(coalesce(sup.full_name, ''))
      );
    if tmp_count > 0 then
      return true;
    end if;

    if to_regclass('public.research_group_members') is not null and to_regclass('public.research_projects') is not null then
      execute $q$
        select count(*)
        from public.research_group_members m
        join public.research_projects p on p.id = coalesce(m.project_id, m.group_id)
        where m.student_id = $1
          and coalesce(m.status, 'Active') in ('Active','Accepted','active','accepted')
          and (p.supervisor_id = $2 or lower(coalesce(p.supervisor_email, '')) = lower((select email from public.profiles where id = $2)))
      $q$ into tmp_count using p_recipient_id, p_requester_id;
      if tmp_count > 0 then return true; end if;
    end if;

    return false;
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
begin
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from auth.uid() then
      raise exception 'Meeting requester must be the logged-in user.';
    end if;
    if not public.meeting_request_relationship_allowed(new.requester_id, new.recipient_id, new.student_id, new.supervisor_id) then
      raise exception 'You can only request meetings with users assigned to you.';
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

    if auth.uid() is distinct from old.requester_id and auth.uid() is distinct from old.recipient_id then
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

alter table public.meeting_requests enable row level security;

drop policy if exists "meeting_requests_select_own" on public.meeting_requests;
create policy "meeting_requests_select_own"
on public.meeting_requests
for select
to authenticated
using (
  auth.uid() = requester_id
  or auth.uid() = recipient_id
  or auth.uid() = student_id
  or auth.uid() = supervisor_id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','committee'))
);

drop policy if exists "meeting_requests_insert_assigned_only" on public.meeting_requests;
create policy "meeting_requests_insert_assigned_only"
on public.meeting_requests
for insert
to authenticated
with check (
  requester_id = auth.uid()
  and public.meeting_request_relationship_allowed(requester_id, recipient_id, student_id, supervisor_id)
);

drop policy if exists "meeting_requests_update_participants" on public.meeting_requests;
create policy "meeting_requests_update_participants"
on public.meeting_requests
for update
to authenticated
using (auth.uid() = requester_id or auth.uid() = recipient_id)
with check (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "meeting_requests_admin_committee_all" on public.meeting_requests;
create policy "meeting_requests_admin_committee_all"
on public.meeting_requests
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','committee')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','committee')));

notify pgrst, 'reload schema';

commit;
