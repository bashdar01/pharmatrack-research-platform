-- Weekly report email, notification, admin-only delete, and profile-menu support update.
-- Run this once in Supabase SQL Editor after deploying the updated app/function.

-- Ensure notification fields required by the existing notification dashboard.
alter table public.notifications add column if not exists recipient_user_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists recipient_email text;
alter table public.notifications add column if not exists sender_user_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists weekly_report_id uuid references public.weekly_reports(id) on delete cascade;
alter table public.notifications add column if not exists project_id uuid references public.research_projects(id) on delete cascade;
alter table public.notifications add column if not exists notification_type text;
alter table public.notifications add column if not exists type text default 'Reminder';
alter table public.notifications add column if not exists target_role text default 'all';

update public.notifications
set recipient_user_id = profile_id
where recipient_user_id is null and profile_id is not null;

-- Keep duplicate protection. Review notification_type now includes a content fingerprint,
-- so repeated identical review clicks do not duplicate, but changed feedback/status can notify again.
create unique index if not exists notifications_report_recipient_type_unique
on public.notifications(profile_id, weekly_report_id, notification_type)
where profile_id is not null and weekly_report_id is not null and notification_type is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_authenticated" on public.notifications;
drop policy if exists "notifications_insert_authenticated" on public.notifications;
drop policy if exists "notifications_update_authenticated" on public.notifications;
drop policy if exists "notifications_select_own_or_admin" on public.notifications;
drop policy if exists "notifications_insert_allowed_report_events" on public.notifications;
drop policy if exists "notifications_update_own_read_status" on public.notifications;

create policy "notifications_select_own_or_admin" on public.notifications
for select to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
        or (notifications.profile_id is null and notifications.recipient_user_id is null and notifications.target_role in ('all', p.role))
      )
  )
);

create policy "notifications_insert_allowed_report_events" on public.notifications
for insert to authenticated with check (
  exists (
    select 1 from public.profiles sender
    where lower(sender.email) = lower(auth.jwt() ->> 'email')
      and coalesce(sender.status, 'Pending') = 'Active'
      and (
        sender.role in ('admin', 'committee', 'student', 'supervisor')
        or notifications.sender_user_id = sender.id
        or notifications.sender_user_id is null
      )
  )
);

create policy "notifications_update_own_read_status" on public.notifications
for update to authenticated using (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
      )
  )
) with check (
  exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and coalesce(p.status, 'Pending') = 'Active'
      and (
        p.role = 'admin'
        or notifications.profile_id = p.id
        or notifications.recipient_user_id = p.id
        or lower(coalesce(notifications.recipient_email, '')) = lower(p.email)
      )
  )
);

-- Report/file ownership columns used for display and admin deletion cleanup.
alter table public.weekly_reports
  add column if not exists submitted_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_by_email text;

alter table public.uploaded_files
  add column if not exists uploaded_by_email text,
  add column if not exists file_url text,
  add column if not exists file_mime_type text;

-- Only admins can delete weekly reports from the backend.
drop policy if exists "weekly_reports_delete_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_or_owner" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;
create policy "weekly_reports_delete_admin_only"
  on public.weekly_reports
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'admin'
    )
  );

-- Only admins can delete uploaded weekly-report files from the backend/storage.
drop policy if exists "uploaded_files_delete_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_admin_or_owner" on public.uploaded_files;
drop policy if exists "uploaded_files_delete_admin_only" on public.uploaded_files;
create policy "uploaded_files_delete_admin_only"
  on public.uploaded_files
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do update set public = true;

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
