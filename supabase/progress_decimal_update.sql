-- Allow project progress to store decimal percentages such as 6.25%.
-- Run this once in Supabase SQL Editor before using the new accepted-report progress system.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'research_projects'
  ) then
    if exists (
      select 1
      from pg_constraint
      where conname = 'research_projects_progress_check'
    ) then
      alter table public.research_projects drop constraint research_projects_progress_check;
    end if;

    alter table public.research_projects
      alter column progress type numeric(5,2) using coalesce(progress, 0)::numeric(5,2),
      alter column progress set default 0;

    alter table public.research_projects
      add constraint research_projects_progress_check check (progress >= 0 and progress <= 100);
  end if;
end $$;
