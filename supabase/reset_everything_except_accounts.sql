-- reset_everything_except_accounts.sql
-- College of Pharmacy Research Platform
--
-- Purpose:
--   Reset project/workflow data only, while keeping all accounts and site settings.
--
-- This script DOES NOT delete or change:
--   - auth.users
--   - public.profiles rows
--   - names, emails, passwords, roles, profile photos
--   - admin/student/supervisor/research committee accounts
--   - app/site/PDF customization settings
--   - profile-photos, logos, site assets, or PDF customization storage buckets
--
-- What it DOES reset:
--   - research projects/titles/groups/members/leaders
--   - group join requests and project/student assignments
--   - weekly reports/reviews/feedback
--   - deadlines/recipients
--   - progress/final evaluation data
--   - student questions/supervisor answers
--   - project/report/question uploaded-file metadata
--   - notifications
--   - project/workflow-related audit/email log rows where such log tables exist
--   - project/workflow reference columns on public.profiles/public.users, if they exist
--
-- Safe/idempotent:
--   - Uses to_regclass/information_schema checks.
--   - Existing missing tables/columns are skipped.
--   - Run in Supabase SQL Editor as a trusted admin/database owner.
--
-- IMPORTANT:
--   Make a Supabase database backup before running any reset script.

begin;

-- -----------------------------------------------------------------------------
-- 1) Clear project/workflow references from account/profile tables only.
--    Rows are kept. Roles, emails, passwords, profile photos, status, and names
--    are kept. Only project/supervisor-assignment fields are nulled if present.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_col text;
  v_account_tables text[] := array[
    'profiles',
    'users'
  ];
  v_project_reference_columns text[] := array[
    -- Requested project/group fields
    'supervisor_id',
    'assigned_supervisor_id',
    'project_supervisor_id',
    'research_group_id',
    'group_id',
    'project_id',
    'research_project_id',
    'research_title_id',
    'current_project_id',
    'current_group_id',
    'project_leader_id',
    'assigned_project_id',
    'assigned_group_id',

    -- Existing/current app compatibility fields
    'current_research_group_id',
    'current_research_group_name',
    'assigned_supervisor_email',
    'assigned_supervisor_name',
    'assigned_supervisor_email_sent_at',
    'assigned_supervisor_email_supervisor_id',
    'assigned_supervisor_email_supervisor_email'
  ];
begin
  foreach v_table in array v_account_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      foreach v_col in array v_project_reference_columns loop
        if exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = v_table
            and column_name = v_col
            and is_nullable = 'YES'
        ) then
          execute format('update public.%I set %I = null where %I is not null', v_table, v_col, v_col);
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Delete project/workflow-related audit-log rows only.
--    Account/role approval audit rows are preserved where possible.
--    This uses a text search over the row JSON so it works across old/new schemas.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    delete from public.audit_logs a
    where to_jsonb(a)::text ~* '(research|project|title|group|member|leader|weekly|report|deadline|evaluation|question|answer|supervisor assignment|student supervisor|join request|progress|rubric|attachment|document|pdf report)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Delete project/workflow-related email-log rows only, if any email-log table
--    exists in this project. Missing tables are skipped.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_email_log_tables text[] := array[
    'email_logs',
    'platform_email_logs',
    'email_notifications',
    'mail_logs',
    'sent_emails',
    'notification_emails'
  ];
begin
  foreach v_table in array v_email_log_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'delete from public.%I t where to_jsonb(t)::text ~* %L',
        v_table,
        '(research|project|title|group|member|leader|weekly|report|deadline|evaluation|question|answer|join request|progress|rubric|attachment|document)'
      );
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4) Truncate all project/workflow tables that exist.
--    This intentionally does NOT include auth.users, profiles, app_settings,
--    website/site/PDF settings, or storage buckets.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_existing_tables text[] := array[]::text[];
  v_reset_tables text[] := array[
    -- Current known tables in this app
    'uploaded_files',
    'student_questions',
    'evaluations',
    'weekly_reports',
    'deadlines',
    'research_group_members',
    'group_join_requests',
    'research_projects',
    'notifications',

    -- Compatibility/future/older workflow tables; skipped if missing
    'research_titles',
    'supervisor_submitted_projects',
    'supervisor_projects',
    'research_groups',
    'project_members',
    'project_leaders',
    'group_members',
    'student_project_assignments',
    'student_supervisor_assignments',
    'project_supervisor_assignments',
    'project_progress',
    'progress_updates',
    'weekly_report_reviews',
    'weekly_report_feedback',
    'weekly_report_attachments',
    'deadline_recipients',
    'final_evaluations',
    'final_evaluation_rubric_scores',
    'student_answers',
    'question_attachments',
    'answer_attachments',
    'project_documents',
    'report_documents',
    'project_files',
    'report_files'
  ];
begin
  foreach v_table in array v_reset_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      v_existing_tables := v_existing_tables || format('public.%I', v_table);
    end if;
  end loop;

  if array_length(v_existing_tables, 1) is not null then
    execute 'truncate table ' || array_to_string(v_existing_tables, ', ') || ' restart identity cascade';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5) Optional Supabase Storage cleanup.
--
-- This is DISABLED by default because SQL deletion from storage.objects should be
-- used carefully. Prefer Supabase Storage UI/API for file deletion when possible.
--
-- To remove only project/report/question files, uncomment the DO block below.
-- Do NOT include profile-photo/logo/site/PDF-customization buckets here.
-- -----------------------------------------------------------------------------
/*
do $$
begin
  if to_regclass('storage.objects') is not null then
    delete from storage.objects
    where bucket_id in (
      'project-documents',
      'weekly-report-attachments',
      'report-attachments',
      'question-attachments',
      'project-files',
      'report-files'
    );
  end if;
end $$;
*/

-- -----------------------------------------------------------------------------
-- 6) Refresh PostgREST schema cache so the website sees the clean state quickly.
-- -----------------------------------------------------------------------------
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  -- Ignore if notification is unavailable in the current environment.
  null;
end $$;

commit;

-- End result:
--   Accounts/profiles/roles remain.
--   Project/workflow data is reset.
--   Students/supervisors/committee/admins can log in normally.
