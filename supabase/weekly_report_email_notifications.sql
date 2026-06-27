-- Weekly report email + notification integration
-- Run this file once in Supabase SQL Editor after supabase/schema.sql.

alter table public.notifications add column if not exists recipient_user_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists recipient_email text;
alter table public.notifications add column if not exists sender_user_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists weekly_report_id uuid references public.weekly_reports(id) on delete cascade;
alter table public.notifications add column if not exists project_id uuid references public.research_projects(id) on delete cascade;
alter table public.notifications add column if not exists notification_type text;
alter table public.notifications add column if not exists type text default 'Reminder';
alter table public.notifications add column if not exists target_role text default 'all';

-- Backfill recipient_user_id from the old profile_id column.
update public.notifications
set recipient_user_id = profile_id
where recipient_user_id is null and profile_id is not null;

-- Prevent duplicate weekly-report notifications for the same recipient/action/report.
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

-- Users read only their own notifications; admins can monitor all.
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

-- Insert is allowed for active users when creating a system notification tied to a report they can submit/review.
create policy "notifications_insert_allowed_report_events" on public.notifications
for insert to authenticated with check (
  exists (
    select 1 from public.profiles sender
    where lower(sender.email) = lower(auth.jwt() ->> 'email')
      and coalesce(sender.status, 'Pending') = 'Active'
      and (
        sender.role in ('admin', 'committee')
        or notifications.sender_user_id = sender.id
        or notifications.sender_user_id is null
      )
  )
);

-- Users can mark their own notifications read/unread; admins can update all.
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
