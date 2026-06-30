
-- Hide/disable Join Research Group for students who already have an active group.
-- Backend protection: reject new join requests from already-assigned students.
create or replace function public.student_has_active_research_group_for_request(
  check_student_id uuid,
  check_student_email text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where (
      (check_student_id is not null and p.id = check_student_id)
      or (nullif(check_student_email, '') is not null and lower(p.email) = lower(check_student_email))
    )
    and (
      p.current_research_group_id is not null
      or nullif(trim(coalesce(p.current_research_group_name, '')), '') is not null
    )
  )
  or exists (
    select 1
    from public.research_group_members rgm
    where coalesce(rgm.status, 'Active') = 'Active'
      and (
        (check_student_id is not null and rgm.student_id = check_student_id)
        or (nullif(check_student_email, '') is not null and lower(coalesce(rgm.student_email, '')) = lower(check_student_email))
      )
  )
  or exists (
    select 1
    from public.group_join_requests gjr
    where gjr.status = 'Accepted'
      and (
        (check_student_id is not null and gjr.student_id = check_student_id)
        or (nullif(check_student_email, '') is not null and lower(coalesce(gjr.student_email, '')) = lower(check_student_email))
      )
  );
$$;

create or replace function public.prevent_group_join_request_for_assigned_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'Pending') = 'Pending'
     and public.student_has_active_research_group_for_request(new.student_id, new.student_email) then
    raise exception 'You are already assigned to a research group.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_group_join_request_for_assigned_student_trigger on public.group_join_requests;
create trigger prevent_group_join_request_for_assigned_student_trigger
before insert on public.group_join_requests
for each row execute function public.prevent_group_join_request_for_assigned_student();

-- Recreate the student insert policy after research_group_members exists, so RLS also blocks assigned students.
drop policy if exists "group_requests_insert_student_own" on public.group_join_requests;
create policy "group_requests_insert_student_own" on public.group_join_requests
for insert to authenticated
with check (
  exists (
    select 1 from public.current_profile_for_rls() p
    where p.role = 'student'
      and (group_join_requests.student_id = p.id or lower(coalesce(group_join_requests.student_email,'')) = lower(p.email))
      and group_join_requests.status = 'Pending'
      and p.current_research_group_id is null
      and nullif(trim(coalesce(p.current_research_group_name, '')), '') is null
      and not exists (
        select 1 from public.research_group_members rgm
        where coalesce(rgm.status, 'Active') = 'Active'
          and (rgm.student_id = p.id or lower(coalesce(rgm.student_email,'')) = lower(p.email))
      )
  )
);

grant execute on function public.student_has_active_research_group_for_request(uuid, text) to authenticated;
grant execute on function public.prevent_group_join_request_for_assigned_student() to authenticated;
