-- PharmaTrack report attachment and progress fix
-- Run this once in Supabase SQL Editor after deploying the updated app.

-- Allow decimal progress values such as 6.25, 12.50, etc.
alter table public.research_projects
  alter column progress type numeric(5,2) using progress::numeric,
  alter column progress set default 0;

alter table public.research_projects
  drop constraint if exists research_projects_progress_check;

alter table public.research_projects
  add constraint research_projects_progress_check check (progress >= 0 and progress <= 100);

-- Add persistent attachment URL/metadata columns for weekly report files.
alter table public.uploaded_files
  add column if not exists file_url text,
  add column if not exists file_mime_type text;

-- Create a public storage bucket for weekly report attachments if it does not already exist.
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do update set public = true;

-- Storage policies for project files.
drop policy if exists "Project files public read" on storage.objects;
create policy "Project files public read"
  on storage.objects
  for select
  using (bucket_id = 'project-files');

drop policy if exists "Authenticated users upload project files" on storage.objects;
create policy "Authenticated users upload project files"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'project-files');

drop policy if exists "Authenticated users update project files" on storage.objects;
create policy "Authenticated users update project files"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'project-files')
  with check (bucket_id = 'project-files');

-- Recalculate stored project progress from accepted reports.
update public.research_projects rp
set progress = least(100, round((coalesce(report_counts.accepted_count, 0) * 6.25)::numeric, 2))
from (
  select rp_inner.id as project_id, count(wr.id) filter (where wr.status = 'Accepted') as accepted_count
  from public.research_projects rp_inner
  left join public.weekly_reports wr on wr.project_id = rp_inner.id
  group by rp_inner.id
) report_counts
where rp.id = report_counts.project_id;
