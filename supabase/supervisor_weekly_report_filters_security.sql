-- Supervisor weekly report filtering and backend access security
-- Run once in Supabase SQL Editor.

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

create or replace function public.current_profile_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.email
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

create or replace function public.current_profile_full_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.role::text
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
  limit 1;
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_email() to authenticated;
grant execute on function public.current_profile_full_name() to authenticated;
grant execute on function public.current_profile_role() to authenticated;

alter table public.weekly_reports enable row level security;

-- Remove old broad policies so supervisors cannot fetch unrelated student reports.
drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_own_student" on public.weekly_reports;
drop policy if exists "weekly_reports_update_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_update_supervisor_or_admin" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;

create policy "weekly_reports_select_role_scoped"
on public.weekly_reports
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'student'
    and (
      weekly_reports.submitted_by_id = public.current_profile_id()
      or weekly_reports.student_id = public.current_profile_id()
      or weekly_reports.user_id = public.current_profile_id()
      or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
);

create policy "weekly_reports_insert_own_student"
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
      or lower(coalesce(submitted_by_email, student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
);

create policy "weekly_reports_update_supervisor_or_admin"
on public.weekly_reports
for update
to authenticated
using (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
)
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and (
          rp.supervisor_id = public.current_profile_id()
          or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(public.current_profile_email(), ''))
          or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(public.current_profile_full_name(), ''))
        )
    )
  )
);

create policy "weekly_reports_delete_admin_only"
on public.weekly_reports
for delete
to authenticated
using (public.current_profile_role() = 'admin');
