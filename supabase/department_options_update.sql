-- Department options update
-- Keeps old submitted records, but restricts new/updated department values to the approved list.

alter table public.weekly_reports
  add column if not exists department text;

-- Fill the new weekly_reports.department column from the related project only when the project area is approved.
update public.weekly_reports wr
set department = rp.area
from public.research_projects rp
where wr.project_id = rp.id
  and wr.department is null
  and rp.area in (
    'Clinical Analysis',
    'Clinical Pharmacy',
    'Pharmaceutical Chemistry and Pharmacognosy',
    'Pharmaceutics',
    'Pharmacology'
  );

alter table public.research_projects
  drop constraint if exists research_projects_area_department_check;

alter table public.research_projects
  add constraint research_projects_area_department_check
  check (area in (
    'Clinical Analysis',
    'Clinical Pharmacy',
    'Pharmaceutical Chemistry and Pharmacognosy',
    'Pharmaceutics',
    'Pharmacology'
  )) not valid;

alter table public.weekly_reports
  drop constraint if exists weekly_reports_department_check;

alter table public.weekly_reports
  add constraint weekly_reports_department_check
  check (department is null or department in (
    'Clinical Analysis',
    'Clinical Pharmacy',
    'Pharmaceutical Chemistry and Pharmacognosy',
    'Pharmaceutics',
    'Pharmacology'
  )) not valid;
