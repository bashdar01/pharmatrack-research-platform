-- Admin subdomain feature parity update
-- Run once in Supabase SQL Editor after deploying this update.

alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists assigned_supervisor_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists assigned_supervisor_email text;
alter table public.profiles add column if not exists assigned_supervisor_name text;

-- Backfill student assigned-supervisor fields from linked research projects when possible.
update public.profiles student
set assigned_supervisor_id = coalesce(student.assigned_supervisor_id, supervisor.id),
    assigned_supervisor_email = coalesce(nullif(student.assigned_supervisor_email, ''), supervisor.email),
    assigned_supervisor_name = coalesce(nullif(student.assigned_supervisor_name, ''), supervisor.full_name)
from public.research_projects rp
left join public.profiles supervisor
  on supervisor.role = 'supervisor'
 and (
      supervisor.id = rp.supervisor_id
      or lower(supervisor.email) = lower(coalesce(rp.supervisor_email, ''))
      or lower(supervisor.full_name) = lower(coalesce(rp.supervisor_name, ''))
 )
where student.role = 'student'
  and supervisor.id is not null
  and (
    student.id = rp.student_id
    or student.id = rp.created_by
    or lower(student.email) = lower(coalesce(rp.student_email, rp.created_by_email, ''))
    or lower(student.full_name) = lower(coalesce(rp.group_name, ''))
    or lower(student.full_name) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
  );

-- Keep direct table updates protected. Admin may update profiles and projects; users may only update their own profile.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.current_profile_role() = 'admin'
);

drop policy if exists "research_projects_update_admin_committee_supervisor" on public.research_projects;
drop policy if exists "research_projects_update_admin_only" on public.research_projects;
create policy "research_projects_update_admin_committee_supervisor"
on public.research_projects
for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
  )
)
with check (
  public.current_profile_role() in ('admin', 'committee')
  or (
    public.current_profile_role() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
  )
);
