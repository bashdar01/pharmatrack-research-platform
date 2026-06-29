-- Update final evaluation rubric metadata for the new /50 scoring system.
-- Existing /100 evaluations are kept. New rows are constrained to 0-10 per stored score column.

alter table if exists public.evaluations
  add column if not exists rubric_max_score integer default 50;

alter table if exists public.evaluations
  add column if not exists rubric_version text default 'final_rubric_50';

update public.evaluations
set rubric_max_score = coalesce(rubric_max_score, 50),
    rubric_version = coalesce(rubric_version, 'final_rubric_50')
where rubric_max_score is null or rubric_version is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluations_final_rubric_50_score_range_chk'
  ) then
    alter table public.evaluations
      add constraint evaluations_final_rubric_50_score_range_chk
      check (
        attendance_score between 0 and 10 and
        progress_score between 0 and 10 and
        research_quality_score between 0 and 10 and
        writing_score between 0 and 10 and
        presentation_score between 0 and 10 and
        teamwork_score between 0 and 10
      ) not valid;
  end if;
end $$;
