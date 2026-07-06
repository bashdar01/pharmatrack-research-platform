-- project_member_report_visibility_fix.sql
-- Fixes project member visibility for progress, weekly reports, supervisor feedback, and attachments.
-- Does NOT change weekly report submission permissions.
-- Does NOT change auth/users/roles.

begin;

-- ------------------------------------------------------------
-- Helper: normalize role aliases used by different app versions.
-- ------------------------------------------------------------
create or replace function public.current_profile_role_normalized()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_profile_role() in ('committee', 'research_committee') then 'committee'
    else public.current_profile_role()
  end;
$$;

grant execute on function public.current_profile_role_normalized() to authenticated;

-- ------------------------------------------------------------
-- Helper: check whether the current signed-in student is an active
-- member of the target research project/group.
-- ------------------------------------------------------------
create or replace function public.current_user_is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = public.current_profile_id()
        and coalesce(p.status, 'Pending') = 'Active'
        and p.role = 'student'
        and (
          exists (
            select 1
            from public.research_group_members rgm
            where lower(coalesce(rgm.status, 'Active')) not in ('removed', 'rejected', 'inactive')
              and (
                rgm.group_id = target_project_id
                or rgm.project_id = target_project_id
              )
              and (
                rgm.student_id = p.id
                or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
              )
          )
          or exists (
            select 1
            from public.research_projects rp
            where rp.id = target_project_id
              and (
                rp.student_id = p.id
                or rp.created_by = p.id
                or lower(coalesce(rp.student_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(rp.created_by_email, '')) = lower(coalesce(p.email, ''))
                or lower(coalesce(p.email, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
                or lower(coalesce(p.full_name, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
              )
          )
        )
    ),
    false
  );
$$;

grant execute on function public.current_user_is_project_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- research_group_members visibility:
-- Students need to read membership rows for their own group/project so
-- the frontend can identify project members and show shared reports.
-- ------------------------------------------------------------
alter table public.research_group_members enable row level security;

drop policy if exists "research_group_members_select_authenticated" on public.research_group_members;
drop policy if exists "research_group_members_select_role_scoped" on public.research_group_members;
drop policy if exists "research_group_members_select_member_project" on public.research_group_members;

create policy "research_group_members_select_member_project"
on public.research_group_members
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      -- own membership row
      student_id = public.current_profile_id()
      or lower(coalesce(student_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      -- other rows in a group/project where current student is also a member
      or public.current_user_is_project_member(coalesce(project_id, group_id))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = coalesce(research_group_members.project_id, research_group_members.group_id)
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
    )
  )
);

-- ------------------------------------------------------------
-- Projects/progress visibility:
-- A student can SELECT a project if they are a member of it.
-- ------------------------------------------------------------
alter table public.research_projects enable row level security;

drop policy if exists "projects_select_authenticated" on public.research_projects;
drop policy if exists "projects_select_role_scoped" on public.research_projects;
drop policy if exists "research_projects_select_member_visible" on public.research_projects;

create policy "research_projects_select_member_visible"
on public.research_projects
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(research_projects.id)
      or research_projects.student_id = public.current_profile_id()
      or research_projects.created_by = public.current_profile_id()
      or lower(coalesce(research_projects.student_email, research_projects.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
      or lower(coalesce(public.current_profile_full_name(), '')) = any(select lower(unnest(coalesce(research_projects.students, array[]::text[]))))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and public.current_user_is_project_supervisor(research_projects.supervisor_id, research_projects.supervisor_email, research_projects.supervisor_name)
  )
);

-- ------------------------------------------------------------
-- Weekly report visibility:
-- Project members can SELECT all weekly reports for their own project.
-- Inserts/updates remain controlled by existing submit/review logic.
-- ------------------------------------------------------------
alter table public.weekly_reports enable row level security;

drop policy if exists "weekly_reports_select_authenticated" on public.weekly_reports;
drop policy if exists "weekly_reports_select_role_scoped" on public.weekly_reports;
drop policy if exists "weekly_reports_select_member_visible" on public.weekly_reports;

create policy "weekly_reports_select_member_visible"
on public.weekly_reports
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(weekly_reports.project_id)
      or weekly_reports.submitted_by_id = public.current_profile_id()
      or weekly_reports.student_id = public.current_profile_id()
      or weekly_reports.user_id = public.current_profile_id()
      or weekly_reports.created_by = public.current_profile_id()
      or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, weekly_reports.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and exists (
      select 1
      from public.research_projects rp
      where rp.id = weekly_reports.project_id
        and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
    )
  )
);

-- ------------------------------------------------------------
-- Uploaded file visibility:
-- Project members can SELECT attachments linked to their project's reports.
-- ------------------------------------------------------------
alter table public.uploaded_files enable row level security;

drop policy if exists "uploaded_files_select_authenticated" on public.uploaded_files;
drop policy if exists "uploaded_files_select_role_scoped" on public.uploaded_files;
drop policy if exists "uploaded_files_select_member_visible" on public.uploaded_files;

create policy "uploaded_files_select_member_visible"
on public.uploaded_files
for select
to authenticated
using (
  public.current_profile_role_normalized() in ('admin', 'committee')
  or (
    public.current_profile_role_normalized() = 'student'
    and (
      public.current_user_is_project_member(uploaded_files.project_id)
      or exists (
        select 1
        from public.weekly_reports wr
        where wr.id = uploaded_files.report_id
          and public.current_user_is_project_member(wr.project_id)
      )
      or uploaded_files.uploaded_by = public.current_profile_id()
      or uploaded_files.user_id = public.current_profile_id()
      or uploaded_files.created_by = public.current_profile_id()
      or lower(coalesce(uploaded_files.uploaded_by_email, uploaded_files.created_by_email, '')) = lower(coalesce(public.current_profile_email(), ''))
    )
  )
  or (
    public.current_profile_role_normalized() = 'supervisor'
    and (
      exists (
        select 1
        from public.research_projects rp
        where rp.id = uploaded_files.project_id
          and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
      )
      or exists (
        select 1
        from public.weekly_reports wr
        join public.research_projects rp on rp.id = wr.project_id
        where wr.id = uploaded_files.report_id
          and public.current_user_is_project_supervisor(rp.supervisor_id, rp.supervisor_email, rp.supervisor_name)
      )
    )
  )
);

-- Refresh PostgREST schema cache.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end $$;

commit;
-- project_member_dashboard_rpc_final_fix.sql
-- Makes project progress, weekly reports, supervisor feedback, and attachments visible
-- to every student who is a member of the same research group/project.
-- Does NOT change weekly report submission permissions.
-- Does NOT change auth, roles, accounts, or project leader logic.

begin;

create or replace function public.get_student_project_member_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.profiles%rowtype;
  v_project_ids uuid[] := array[]::uuid[];
  v_report_ids uuid[] := array[]::uuid[];
  v_projects jsonb := '[]'::jsonb;
  v_reports jsonb := '[]'::jsonb;
  v_uploaded_files jsonb := '[]'::jsonb;
  v_deadlines jsonb := '[]'::jsonb;
  v_group_members jsonb := '[]'::jsonb;
begin
  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  if v_profile.id is null or lower(coalesce(v_profile.role, '')) <> 'student' then
    return jsonb_build_object(
      'projects', '[]'::jsonb,
      'reports', '[]'::jsonb,
      'uploadedFiles', '[]'::jsonb,
      'deadlines', '[]'::jsonb,
      'groupMembers', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct project_id), array[]::uuid[])
  into v_project_ids
  from (
    -- Membership rows are the main source of truth for group/project access.
    select coalesce(rgm.project_id, rgm.group_id) as project_id
    from public.research_group_members rgm
    where lower(coalesce(rgm.status, 'active')) not in ('removed', 'rejected', 'inactive')
      and (rgm.project_id is not null or rgm.group_id is not null)
      and (
        rgm.student_id = v_profile.id
        or lower(coalesce(rgm.student_email, '')) = lower(coalesce(v_profile.email, ''))
        or lower(coalesce(rgm.student_name, '')) = lower(coalesce(v_profile.full_name, ''))
      )

    union

    -- Accepted join requests are also accepted membership evidence.
    select gjr.requested_group_id as project_id
    from public.group_join_requests gjr
    where lower(coalesce(gjr.status, '')) = 'accepted'
      and gjr.requested_group_id is not null
      and (
        gjr.student_id = v_profile.id
        or lower(coalesce(gjr.student_email, '')) = lower(coalesce(v_profile.email, ''))
        or lower(coalesce(gjr.student_name, '')) = lower(coalesce(v_profile.full_name, ''))
      )

    union

    -- Legacy/direct ownership fields.
    select rp.id as project_id
    from public.research_projects rp
    where rp.student_id = v_profile.id
       or rp.created_by = v_profile.id
       or lower(coalesce(rp.student_email, '')) = lower(coalesce(v_profile.email, ''))
       or lower(coalesce(rp.created_by_email, '')) = lower(coalesce(v_profile.email, ''))
       or lower(coalesce(v_profile.email, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
       or lower(coalesce(v_profile.full_name, '')) = any(select lower(unnest(coalesce(rp.students, array[]::text[]))))
  ) source
  where project_id is not null;

  -- Ensure there is always a stable array value.
  v_project_ids := coalesce(v_project_ids, array[]::uuid[]);

  select coalesce(jsonb_agg(to_jsonb(rp) order by rp.created_at desc), '[]'::jsonb)
  into v_projects
  from public.research_projects rp
  where rp.id = any(v_project_ids);

  select coalesce(jsonb_agg(to_jsonb(rgm) order by rgm.joined_at desc nulls last, rgm.created_at desc nulls last), '[]'::jsonb)
  into v_group_members
  from public.research_group_members rgm
  where coalesce(rgm.project_id, rgm.group_id) = any(v_project_ids)
    and lower(coalesce(rgm.status, 'active')) not in ('removed', 'rejected', 'inactive');

  select coalesce(jsonb_agg(to_jsonb(wr) order by wr.submitted_at desc), '[]'::jsonb),
         coalesce(array_agg(wr.id), array[]::uuid[])
  into v_reports, v_report_ids
  from public.weekly_reports wr
  where wr.project_id = any(v_project_ids);

  v_report_ids := coalesce(v_report_ids, array[]::uuid[]);

  select coalesce(jsonb_agg(to_jsonb(uf) order by uf.created_at desc), '[]'::jsonb)
  into v_uploaded_files
  from public.uploaded_files uf
  where uf.project_id = any(v_project_ids)
     or uf.report_id = any(v_report_ids);

  select coalesce(jsonb_agg(to_jsonb(d) order by d.due_date asc nulls last, d.created_at desc), '[]'::jsonb)
  into v_deadlines
  from public.deadlines d
  where
    -- General deadlines remain visible.
    lower(coalesce(d.target_scope, 'all')) in ('all', 'everyone', 'students')
    -- Student-targeted deadlines.
    or v_profile.id = any(coalesce(d.target_student_ids, array[]::uuid[]))
    or lower(coalesce(v_profile.email, '')) = any(select lower(unnest(coalesce(d.target_student_emails, array[]::text[]))))
    or lower(coalesce(v_profile.full_name, '')) = any(select lower(unnest(coalesce(d.target_student_names, array[]::text[]))));

  return jsonb_build_object(
    'projects', coalesce(v_projects, '[]'::jsonb),
    'reports', coalesce(v_reports, '[]'::jsonb),
    'uploadedFiles', coalesce(v_uploaded_files, '[]'::jsonb),
    'deadlines', coalesce(v_deadlines, '[]'::jsonb),
    'groupMembers', coalesce(v_group_members, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_student_project_member_dashboard() to authenticated;

-- Keep/select policies broad enough for normal query paths too.
alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_select_project_members_final" on public.weekly_reports;
create policy "weekly_reports_select_project_members_final"
on public.weekly_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'committee')
        or weekly_reports.submitted_by_id = p.id
        or weekly_reports.student_id = p.id
        or weekly_reports.user_id = p.id
        or weekly_reports.created_by = p.id
        or lower(coalesce(weekly_reports.submitted_by_email, weekly_reports.student_email, weekly_reports.created_by_email, '')) = lower(coalesce(p.email, ''))
        or exists (
          select 1
          from public.research_group_members rgm
          where coalesce(rgm.project_id, rgm.group_id) = weekly_reports.project_id
            and lower(coalesce(rgm.status, 'active')) not in ('removed', 'rejected', 'inactive')
            and (
              rgm.student_id = p.id
              or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
              or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
            )
        )
        or exists (
          select 1
          from public.research_projects rp
          where rp.id = weekly_reports.project_id
            and p.role = 'supervisor'
            and (
              rp.supervisor_id = p.id
              or lower(coalesce(rp.supervisor_email, '')) = lower(coalesce(p.email, ''))
              or lower(coalesce(rp.supervisor_name, '')) = lower(coalesce(p.full_name, ''))
            )
        )
      )
  )
);

alter table public.uploaded_files enable row level security;
drop policy if exists "uploaded_files_select_project_members_final" on public.uploaded_files;
create policy "uploaded_files_select_project_members_final"
on public.uploaded_files
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'committee')
        or uploaded_files.uploaded_by = p.id
        or uploaded_files.user_id = p.id
        or uploaded_files.created_by = p.id
        or lower(coalesce(uploaded_files.uploaded_by_email, uploaded_files.created_by_email, '')) = lower(coalesce(p.email, ''))
        or exists (
          select 1
          from public.research_group_members rgm
          where coalesce(rgm.project_id, rgm.group_id) = uploaded_files.project_id
            and lower(coalesce(rgm.status, 'active')) not in ('removed', 'rejected', 'inactive')
            and (
              rgm.student_id = p.id
              or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
              or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
            )
        )
        or exists (
          select 1
          from public.weekly_reports wr
          join public.research_group_members rgm on coalesce(rgm.project_id, rgm.group_id) = wr.project_id
          where wr.id = uploaded_files.report_id
            and lower(coalesce(rgm.status, 'active')) not in ('removed', 'rejected', 'inactive')
            and (
              rgm.student_id = p.id
              or lower(coalesce(rgm.student_email, '')) = lower(coalesce(p.email, ''))
              or lower(coalesce(rgm.student_name, '')) = lower(coalesce(p.full_name, ''))
            )
        )
      )
  )
);

-- Refresh PostgREST schema cache.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end $$;

commit;
