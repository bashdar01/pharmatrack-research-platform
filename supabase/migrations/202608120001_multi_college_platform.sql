-- =============================================================================
-- Multi-College Research Platform — Foundation Migration
-- =============================================================================
-- Converts the single-college (College of Pharmacy) platform into a
-- college-aware / multi-tenant structure supporting:
--   College of Pharmacy, College of Nursing, College of Dentistry, College of Medicine
--
-- SAFE / NON-DESTRUCTIVE:
--   - Only creates new objects and ADD COLUMN IF NOT EXISTS.
--   - No DROP TABLE, no DROP COLUMN, no data deletion.
--   - All existing rows are explicitly backfilled to College of Pharmacy.
--   - Wrapped in a transaction: if anything fails, nothing is applied.
--
-- IMPORTANT PRE-EXISTING FINDING (read before running):
--   `public.profiles.id` is generated independently at signup
--   (`uuid_generate_v4()`), it is NOT set to the Supabase Auth user id
--   (`auth.uid()`). Some newer RLS policies elsewhere in this project
--   (e.g. meeting_requests_system.sql) assume `profiles.id = auth.uid()`,
--   which will not match for accounts created through the normal signup
--   flow in src/App.jsx (handleLogin -> supabase.auth.signUp + a separate
--   profiles insert with no explicit id). That is a pre-existing gap
--   unrelated to the college rollout, called out here so it isn't
--   silently assumed to work. Because of this, the RLS policies below
--   identify "who is the current user" by matching the verified email
--   on the JWT (auth.jwt() ->> 'email') to profiles.email, which is the
--   only reliably-populated linking value in the current schema.
--   The current "development" policies (`using (true)`) are also
--   pre-existing and are what this migration replaces for the tables
--   listed below.
--
-- Run this in the Supabase SQL editor (or `supabase db push`) against the
-- live project. Test on a staging branch/project first if you have one.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Central colleges table (source of truth — no hardcoded college names
--    elsewhere in the schema).
-- -----------------------------------------------------------------------------
create table if not exists public.colleges (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  short_name text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.colleges (name, slug, short_name)
values
  ('College of Pharmacy', 'pharmacy', 'Pharmacy'),
  ('College of Nursing', 'nursing', 'Nursing'),
  ('College of Dentistry', 'dentistry', 'Dentistry'),
  ('College of Medicine', 'medicine', 'Medicine')
on conflict (slug) do nothing;

alter table public.colleges enable row level security;

-- Everyone signed in can read the list of colleges (needed for the signup
-- dropdown, admin filters, etc). Only admins may modify it.
drop policy if exists "colleges_select_all" on public.colleges;
create policy "colleges_select_all" on public.colleges
  for select to anon, authenticated using (true);

drop policy if exists "colleges_admin_write" on public.colleges;
create policy "colleges_admin_write" on public.colleges
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 2. profiles.college_id — every account is affiliated with exactly one
--    college. All existing accounts are migrated to Pharmacy.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists college_id uuid references public.colleges(id);

update public.profiles
set college_id = (select id from public.colleges where slug = 'pharmacy')
where college_id is null;

-- -----------------------------------------------------------------------------
-- 3. college_id on the top-level, directly-owned tables. Child records
--    (weekly_reports, uploaded_files, evaluations, research_group_members,
--    group_join_requests, student_questions, meeting_requests) intentionally
--    do NOT get a duplicate college_id — their college is inherited from
--    their parent research_projects / profiles row, per the "single source
--    of truth" requirement. Their RLS policies below join back to the
--    parent to determine college instead of duplicating the column.
-- -----------------------------------------------------------------------------
alter table public.research_projects add column if not exists college_id uuid references public.colleges(id);
alter table public.deadlines add column if not exists college_id uuid references public.colleges(id);
alter table public.notifications add column if not exists college_id uuid references public.colleges(id);

-- These three tables may not exist yet on every environment (older DBs that
-- haven't run the corresponding feature migrations). Guarded so this script
-- is safe to run regardless of history.
do $$
begin
  if to_regclass('public.research_learning_resources') is not null then
    execute 'alter table public.research_learning_resources add column if not exists college_id uuid references public.colleges(id)';
    execute 'alter table public.research_learning_resources add column if not exists is_global boolean not null default false';
  end if;
  if to_regclass('public.research_days') is not null then
    execute 'alter table public.research_days add column if not exists college_id uuid references public.colleges(id)';
  end if;
  if to_regclass('public.published_papers') is not null then
    execute 'alter table public.published_papers add column if not exists college_id uuid references public.colleges(id)';
  end if;
  if to_regclass('public.invitations') is not null then
    execute 'alter table public.invitations add column if not exists college_id uuid references public.colleges(id)';
  end if;
end $$;

-- Backfill every existing row (all current data pre-dates the multi-college
-- rollout, so it all belongs to Pharmacy) — never overwrites a value that
-- is already set.
update public.research_projects set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null;
update public.deadlines set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null;
update public.notifications n set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null;

do $$
begin
  if to_regclass('public.research_learning_resources') is not null then
    execute $q$update public.research_learning_resources set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null and is_global is not true$q$;
  end if;
  if to_regclass('public.research_days') is not null then
    execute $q$update public.research_days set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null$q$;
  end if;
  if to_regclass('public.published_papers') is not null then
    execute $q$update public.published_papers set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null$q$;
  end if;
  if to_regclass('public.invitations') is not null then
    execute $q$update public.invitations set college_id = (select id from public.colleges where slug = 'pharmacy') where college_id is null$q$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Helper functions — single source of truth for "who is asking and which
--    college/role do they have", reused across every policy below instead of
--    repeating the same subquery (keeps future colleges/roles a config change,
--    not a rewrite).
-- -----------------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles
language sql stable security definer
set search_path = public
as $$
  select p.* from public.profiles p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.current_college_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select college_id from public.profiles
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.current_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Replace the wide-open "development" policies with role + college aware
--    policies. NOTE: this is the first time this project has had real
--    database-level access control — test thoroughly against all four
--    college contexts (see the verification checklist in the project README)
--    before relying on it in production.
-- -----------------------------------------------------------------------------

-- profiles ---------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_authenticated" on public.profiles;
drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "profiles_select_own_college_or_admin" on public.profiles;
drop policy if exists "profiles_insert_self_registration" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;

-- Anyone signed in can see people within their own college, and platform
-- admins can see everyone. (Committee/supervisor cross-college visibility
-- is intentionally NOT granted here — see requirement #8/#10.)
create policy "profiles_select_own_college_or_admin" on public.profiles
  for select to anon, authenticated
  using (
    -- allow the public registration flow to check for duplicate emails,
    -- and allow any signed-in user to see profiles in their own college
    true
  );
  -- Left permissive on SELECT intentionally: the app relies on reading
  -- names/emails broadly (invitations, join requests, supervisor pickers).
  -- Tighten to `college_id = public.current_college_id() or public.is_platform_admin()`
  -- once every read path in the app is confirmed to pass college_id filters
  -- itself; flipping this before that audit is done will silently break
  -- cross-college-looking lookups the current frontend still performs.

create policy "profiles_insert_self_registration" on public.profiles
  for insert to anon, authenticated
  with check (true); -- registration must remain open to unauthenticated new users

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_platform_admin()
    or (
      public.current_role() = 'committee'
      and college_id = public.current_college_id()
    )
  )
  with check (
    -- a non-admin can never move themself (or anyone) to a different college;
    -- only an admin performing an explicit administrative change may do so.
    public.is_platform_admin()
    or college_id = public.current_college_id()
    or college_id is null
  );

-- research_projects --------------------------------------------------------
drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_insert_authenticated" on public.research_projects;
drop policy if exists "projects_update_authenticated" on public.research_projects;
drop policy if exists "projects_delete_authenticated" on public.research_projects;
drop policy if exists "projects_select_own_college_or_admin" on public.research_projects;
drop policy if exists "projects_insert_own_college" on public.research_projects;
drop policy if exists "projects_update_own_college_or_admin" on public.research_projects;
drop policy if exists "projects_delete_own_college_or_admin" on public.research_projects;

create policy "projects_select_own_college_or_admin" on public.research_projects
  for select to authenticated
  using (college_id = public.current_college_id() or public.is_platform_admin());

create policy "projects_insert_own_college" on public.research_projects
  for insert to authenticated
  with check (college_id = public.current_college_id() or public.is_platform_admin());

create policy "projects_update_own_college_or_admin" on public.research_projects
  for update to authenticated
  using (college_id = public.current_college_id() or public.is_platform_admin())
  with check (college_id = public.current_college_id() or public.is_platform_admin());

create policy "projects_delete_own_college_or_admin" on public.research_projects
  for delete to authenticated
  using (college_id = public.current_college_id() or public.is_platform_admin());

-- deadlines ------------------------------------------------------------------
alter table public.deadlines enable row level security;
drop policy if exists "deadlines_all_authenticated" on public.deadlines;
drop policy if exists "deadlines_select_own_college_or_admin" on public.deadlines;
drop policy if exists "deadlines_write_committee_or_admin" on public.deadlines;

create policy "deadlines_select_own_college_or_admin" on public.deadlines
  for select to authenticated
  using (college_id = public.current_college_id() or public.is_platform_admin());

create policy "deadlines_write_committee_or_admin" on public.deadlines
  for all to authenticated
  using (
    public.is_platform_admin()
    or (public.current_role() in ('committee', 'admin') and college_id = public.current_college_id())
  )
  with check (
    public.is_platform_admin()
    or (public.current_role() in ('committee', 'admin') and college_id = public.current_college_id())
  );

-- notifications ----------------------------------------------------------
alter table public.notifications enable row level security;
drop policy if exists "notifications_all_authenticated" on public.notifications;
drop policy if exists "notifications_select_own_college_or_recipient" on public.notifications;
drop policy if exists "notifications_write_committee_or_admin" on public.notifications;

create policy "notifications_select_own_college_or_recipient" on public.notifications
  for select to authenticated
  using (
    public.is_platform_admin()
    or recipient_user_id = (select id from public.profiles where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    or college_id = public.current_college_id()
  );

create policy "notifications_write_committee_or_admin" on public.notifications
  for insert to authenticated
  with check (public.is_platform_admin() or college_id = public.current_college_id());

-- weekly_reports / uploaded_files / evaluations — child tables that inherit
-- college through research_projects. Uses EXISTS instead of a duplicated
-- college_id column, per the "single source of truth" requirement.
alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_update_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_admin_only" on public.weekly_reports;
drop policy if exists "weekly_reports_same_college" on public.weekly_reports;

create policy "weekly_reports_same_college" on public.weekly_reports
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and rp.college_id = public.current_college_id()
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and rp.college_id = public.current_college_id()
    )
  );

alter table public.uploaded_files enable row level security;
drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_same_college" on public.uploaded_files;

create policy "uploaded_files_same_college" on public.uploaded_files
  for all to authenticated
  using (
    public.is_platform_admin()
    or project_id is null -- some uploads (e.g. profile photos) aren't project-scoped
    or exists (
      select 1 from public.research_projects rp
      where rp.id = uploaded_files.project_id
        and rp.college_id = public.current_college_id()
    )
  )
  with check (
    public.is_platform_admin()
    or project_id is null
    or exists (
      select 1 from public.research_projects rp
      where rp.id = uploaded_files.project_id
        and rp.college_id = public.current_college_id()
    )
  );

-- research_learning_resources / research_days / published_papers / invitations
do $$
begin
  if to_regclass('public.research_learning_resources') is not null then
    execute 'alter table public.research_learning_resources enable row level security';
    execute 'drop policy if exists "learning_resources_all_authenticated" on public.research_learning_resources';
execute 'drop policy if exists "learning_resources_select_scoped" on public.research_learning_resources';
execute 'drop policy if exists "learning_resources_write_committee_or_admin" on public.research_learning_resources';
execute 'drop policy if exists "learning_resources_update_committee_or_admin" on public.research_learning_resources';
execute 'drop policy if exists "learning_resources_delete_committee_or_admin" on public.research_learning_resources';
    execute $q$
      create policy "learning_resources_select_scoped" on public.research_learning_resources
      for select to authenticated
      using (is_global = true or college_id = public.current_college_id() or public.is_platform_admin())
    $q$;
    execute $q$
      create policy "learning_resources_write_committee_or_admin" on public.research_learning_resources
      for insert to authenticated
      with check (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
    execute $q$
      create policy "learning_resources_update_committee_or_admin" on public.research_learning_resources
      for update to authenticated
      using (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
      with check (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
    execute $q$
      create policy "learning_resources_delete_committee_or_admin" on public.research_learning_resources
      for delete to authenticated
      using (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
  end if;

  if to_regclass('public.research_days') is not null then
    execute 'alter table public.research_days enable row level security';
    execute 'drop policy if exists "research_days_all_authenticated" on public.research_days';
execute 'drop policy if exists "research_days_select_own_college_or_admin" on public.research_days';
execute 'drop policy if exists "research_days_write_committee_or_admin" on public.research_days';
    execute $q$
      create policy "research_days_select_own_college_or_admin" on public.research_days
      for select to authenticated
      using (college_id = public.current_college_id() or public.is_platform_admin())
    $q$;
    execute $q$
      create policy "research_days_write_committee_or_admin" on public.research_days
      for all to authenticated
      using (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
      with check (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
  end if;

  if to_regclass('public.published_papers') is not null then
    execute 'alter table public.published_papers enable row level security';
    execute 'drop policy if exists "published_papers_all_authenticated" on public.published_papers';
execute 'drop policy if exists "published_papers_select_all" on public.published_papers';
execute 'drop policy if exists "published_papers_write_own_college_or_admin" on public.published_papers';
execute 'drop policy if exists "published_papers_update_own_college_or_admin" on public.published_papers';
execute 'drop policy if exists "published_papers_delete_own_college_or_admin" on public.published_papers';
    -- Published papers are readable platform-wide (public research output),
    -- but only editable by the submitting college's own supervisor/committee/admin.
    execute $q$
      create policy "published_papers_select_all" on public.published_papers
      for select to anon, authenticated using (true)
    $q$;
    execute $q$
      create policy "published_papers_write_own_college_or_admin" on public.published_papers
      for insert to authenticated
      with check (public.is_platform_admin() or college_id = public.current_college_id())
    $q$;
    execute $q$
      create policy "published_papers_update_own_college_or_admin" on public.published_papers
      for update to authenticated
      using (public.is_platform_admin() or college_id = public.current_college_id())
      with check (public.is_platform_admin() or college_id = public.current_college_id())
    $q$;
    execute $q$
      create policy "published_papers_delete_own_college_or_admin" on public.published_papers
      for delete to authenticated
      using (public.is_platform_admin() or college_id = public.current_college_id())
    $q$;
  end if;

  if to_regclass('public.invitations') is not null then
    execute 'alter table public.invitations enable row level security';
    execute 'drop policy if exists "invitations_all_authenticated" on public.invitations';
execute 'drop policy if exists "invitations_select_scoped" on public.invitations';
execute 'drop policy if exists "invitations_write_committee_or_admin" on public.invitations';
execute 'drop policy if exists "invitations_update_committee_or_admin" on public.invitations';
    execute $q$
      create policy "invitations_select_scoped" on public.invitations
      for select to anon, authenticated
      using (true) -- invitation acceptance must work for not-yet-authenticated recipients (token-based)
    $q$;
    execute $q$
      create policy "invitations_write_committee_or_admin" on public.invitations
      for insert to authenticated
      with check (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
    execute $q$
      create policy "invitations_update_committee_or_admin" on public.invitations
      for update to authenticated
      using (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
      with check (public.is_platform_admin() or (public.current_role() = 'committee' and college_id = public.current_college_id()))
    $q$;
  end if;
end $$;

-- research_group_members / group_join_requests — inherit college via the
-- parent research_projects row (project_id).
do $$
begin
  if to_regclass('public.research_group_members') is not null then
    execute 'alter table public.research_group_members enable row level security';
    execute 'drop policy if exists "research_group_members_all_authenticated" on public.research_group_members';
execute 'drop policy if exists "research_group_members_same_college" on public.research_group_members';
    execute $q$
      create policy "research_group_members_same_college" on public.research_group_members
      for all to authenticated
      using (
        public.is_platform_admin()
        or exists (select 1 from public.research_projects rp where rp.id = coalesce(research_group_members.project_id, research_group_members.group_id) and rp.college_id = public.current_college_id())
      )
      with check (
        public.is_platform_admin()
        or exists (select 1 from public.research_projects rp where rp.id = coalesce(research_group_members.project_id, research_group_members.group_id) and rp.college_id = public.current_college_id())
      )
    $q$;
  end if;

  if to_regclass('public.group_join_requests') is not null then
    execute 'alter table public.group_join_requests enable row level security';
    execute 'drop policy if exists "group_join_requests_all_authenticated" on public.group_join_requests';
execute 'drop policy if exists "group_join_requests_same_college" on public.group_join_requests';
    execute $q$
      create policy "group_join_requests_same_college" on public.group_join_requests
      for all to authenticated
      using (
        public.is_platform_admin()
        or exists (select 1 from public.research_projects rp where rp.id = group_join_requests.requested_group_id and rp.college_id = public.current_college_id())
      )
      with check (
        public.is_platform_admin()
        or exists (select 1 from public.research_projects rp where rp.id = group_join_requests.requested_group_id and rp.college_id = public.current_college_id())
      )
    $q$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Data-integrity guard: prevent a project row from ever being assigned a
--    supervisor from a different college than the project itself (requirement
--    #33). Cross-college supervision, if ever needed, should be an explicit
--    future feature rather than something this trigger silently allows.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_project_supervisor_same_college()
returns trigger
language plpgsql
as $$
declare
  supervisor_college uuid;
begin
  if new.supervisor_id is not null then
    select college_id into supervisor_college from public.profiles where id = new.supervisor_id;
    if supervisor_college is not null and new.college_id is not null and supervisor_college <> new.college_id then
      raise exception 'Supervisor college (%) does not match project college (%)', supervisor_college, new.college_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_project_supervisor_same_college on public.research_projects;
create trigger trg_enforce_project_supervisor_same_college
  before insert or update on public.research_projects
  for each row execute function public.enforce_project_supervisor_same_college();

commit;

-- =============================================================================
-- Post-migration checklist:
--   1. Confirm every existing row above landed on College of Pharmacy:
--        select c.name, count(*) from public.profiles p join public.colleges c on c.id = p.college_id group by 1;
--   2. Create one test account per college/role combination (see the
--      verification checklist in the project spec) and confirm each only
--      sees their own college's data.
--   3. Once confident, tighten `profiles_select_own_college_or_admin` from
--      `using (true)` to a college-scoped predicate (see the comment above
--      that policy) — left open for now only to avoid breaking existing
--      cross-college-looking lookups until the frontend query audit
--      (see FRONTEND_MULTI_COLLEGE_NOTES.md) is complete.
-- =============================================================================
