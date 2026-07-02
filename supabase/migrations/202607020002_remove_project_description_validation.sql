-- Remove the previous 200-character database validation for supervisor project details.
-- The website no longer collects or displays project detail text on project cards.

drop trigger if exists trg_enforce_research_project_description_limit on public.research_projects;
drop function if exists public.enforce_research_project_description_limit();
