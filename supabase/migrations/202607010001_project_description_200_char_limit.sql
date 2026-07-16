-- Enforce the supervisor project Description / Abstract limit for new submissions and description edits.
-- Existing older projects with longer abstracts can still be read and can still be reviewed
-- as long as their project_description value is not resubmitted/edited.

create or replace function public.enforce_research_project_description_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if char_length(coalesce(new.project_description, '')) > 200 then
    raise exception 'Description / Abstract must be 200 characters or less.' using errcode = '22001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_research_project_description_limit on public.research_projects;
create trigger trg_enforce_research_project_description_limit
before insert or update of project_description on public.research_projects
for each row execute function public.enforce_research_project_description_limit();
