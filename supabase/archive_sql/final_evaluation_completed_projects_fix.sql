-- Final Evaluation Rubric /50 and completed-project eligibility fix
-- Run once in Supabase SQL Editor.

alter table public.evaluations
  add column if not exists max_score integer default 50;

alter table public.evaluations
  add column if not exists rubric_version text default 'final_rubric_50_v1';

alter table public.evaluations
  add column if not exists updated_at timestamptz default now();

alter table public.evaluations
  alter column evaluation_type set default 'Final Evaluation Rubric /50',
  alter column max_score set default 50,
  alter column rubric_version set default 'final_rubric_50_v1';

-- Keep old /100 evaluations; these NOT VALID constraints apply to new/updated /50 records.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'evaluations_title_novelty_0_10') then
    alter table public.evaluations add constraint evaluations_title_novelty_0_10 check (attendance_score between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_research_contents_0_10') then
    alter table public.evaluations add constraint evaluations_research_contents_0_10 check (progress_score between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_flow_data_0_10') then
    alter table public.evaluations add constraint evaluations_flow_data_0_10 check (research_quality_score between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_plagiarism_ai_0_10') then
    alter table public.evaluations add constraint evaluations_plagiarism_ai_0_10 check (writing_score between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_guideline_0_10') then
    alter table public.evaluations add constraint evaluations_guideline_0_10 check (presentation_score between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_teamwork_0_10') then
    alter table public.evaluations add constraint evaluations_teamwork_0_10 check (teamwork_score between 0 and 10) not valid;
  end if;
end $$;

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

grant execute on function public.current_profile_role() to authenticated;

create or replace function public.project_is_final_evaluation_eligible(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.research_projects rp
    where rp.id = target_project_id
      and coalesce(rp.progress, 0) >= 100
  );
$$;

grant execute on function public.project_is_final_evaluation_eligible(uuid) to authenticated;

alter table public.evaluations enable row level security;

drop policy if exists "evaluations_select_authenticated" on public.evaluations;
drop policy if exists "evaluations_insert_authenticated" on public.evaluations;
drop policy if exists "evaluations_update_authenticated" on public.evaluations;
drop policy if exists "evaluations_insert_completed_projects_only" on public.evaluations;
drop policy if exists "evaluations_update_completed_projects_only" on public.evaluations;

create policy "evaluations_select_authenticated"
on public.evaluations
for select
to authenticated
using (true);

create policy "evaluations_insert_completed_projects_only"
on public.evaluations
for insert
to authenticated
with check (
  public.current_profile_role() in ('admin', 'committee')
  and public.project_is_final_evaluation_eligible(project_id)
  and attendance_score between 0 and 10
  and progress_score between 0 and 10
  and research_quality_score between 0 and 10
  and writing_score between 0 and 10
  and presentation_score between 0 and 10
  and teamwork_score between 0 and 10
);

create policy "evaluations_update_completed_projects_only"
on public.evaluations
for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'committee')
)
with check (
  public.project_is_final_evaluation_eligible(project_id)
  and attendance_score between 0 and 10
  and progress_score between 0 and 10
  and research_quality_score between 0 and 10
  and writing_score between 0 and 10
  and presentation_score between 0 and 10
  and teamwork_score between 0 and 10
);
