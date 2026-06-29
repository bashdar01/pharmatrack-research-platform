-- Weekly report department optional update.
-- Safe/idempotent: removes any old NOT NULL requirement from weekly_reports.department.
-- The column is kept for old reports and admin/profile compatibility, but new weekly report submissions do not require it.

do $$
begin
  if to_regclass('public.weekly_reports') is not null then
    execute 'alter table public.weekly_reports add column if not exists department text';
    execute 'alter table public.weekly_reports alter column department drop not null';
  end if;
end $$;
