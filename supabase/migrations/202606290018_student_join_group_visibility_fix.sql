-- Student Join Research Group visibility fix
-- Safe to run multiple times.

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

grant execute on function public.current_profile_for_rls() to authenticated;

-- Allow students to see available research groups/projects in the Join Research Group page.
-- This does not allow editing groups.
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
