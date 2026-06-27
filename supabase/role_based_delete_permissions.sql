-- PharmaTrack role-based delete permissions
-- Run this once in Supabase SQL Editor after deploying the updated app.
-- This makes report/document deletion safe on the database/storage side.

-- Track report and file ownership for secure deletion.
alter table public.weekly_reports
  add column if not exists submitted_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_by_email text;

alter table public.uploaded_files
  add column if not exists uploaded_by_email text,
  add column if not exists file_url text,
  add column if not exists file_mime_type text;

-- Backfill report ownership where possible from existing text fields.
update public.weekly_reports wr
set submitted_by_id = p.id
from public.profiles p
where wr.submitted_by_id is null
  and (
    lower(coalesce(wr.submitted_by_email, '')) = lower(p.email)
    or lower(coalesce(wr.submitted_by, '')) = lower(p.email)
    or lower(coalesce(wr.submitted_by, '')) = lower(p.full_name)
  );

update public.weekly_reports wr
set submitted_by_email = p.email
from public.profiles p
where coalesce(wr.submitted_by_email, '') = ''
  and wr.submitted_by_id = p.id;

-- Backfill uploaded-file ownership from the linked weekly report where possible.
update public.uploaded_files uf
set uploaded_by = wr.submitted_by_id,
    uploaded_by_email = coalesce(uf.uploaded_by_email, wr.submitted_by_email)
from public.weekly_reports wr
where uf.report_id = wr.id
  and uf.uploaded_by is null;

-- Replace open delete policies with role/owner checks.
drop policy if exists "weekly_reports_delete_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_or_owner" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;
create policy "weekly_reports_delete_admin_only"
  on public.weekly_reports
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'admin'
    )
  );

drop policy if exists "uploaded_files_delete_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_admin_or_owner" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_admin_only" on public.uploaded_files;
create policy "uploaded_files_delete_admin_only"
  on public.uploaded_files
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'admin'
    )
  );


-- Ensure the report/document storage bucket exists.
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do update set public = true;

-- Storage delete policy for uploaded project/report files.
-- The frontend deletes the storage object first, then deletes the database row.
drop policy if exists "Project files owners and admins can delete" on storage.objects;
create policy "Project files owners and admins can delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and (
          p.role = 'admin'
          or exists (
            select 1
            from public.uploaded_files uf
            left join public.weekly_reports wr on wr.id = uf.report_id
            where uf.file_path = storage.objects.name
              and (
                uf.uploaded_by = p.id
                or lower(coalesce(uf.uploaded_by_email, '')) = lower(p.email)
                or wr.submitted_by_id = p.id
                or lower(coalesce(wr.submitted_by_email, '')) = lower(p.email)
                or lower(coalesce(wr.submitted_by, '')) in (lower(p.email), lower(p.full_name))
              )
          )
        )
    )
  );

notify pgrst, 'reload schema';


-- Final override: only admins can delete weekly report attachments from storage.
drop policy if exists "Project files owners and admins can delete" on storage.objects;
drop policy if exists "Project files admins can delete" on storage.objects;
create policy "Project files admins can delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'admin'
    )
  );

notify pgrst, 'reload schema';
