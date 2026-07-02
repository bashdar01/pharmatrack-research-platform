-- Enforce one-time Research Committee project decisions.
-- Research Committee can decide a pending supervisor-submitted project once.
-- After Accepted / Revision Requested / Rejected, only Admin can intentionally override decision fields.

create or replace function public.enforce_one_time_committee_project_decision()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_role text := public.current_profile_role();
  old_decision_key text := '';
  new_decision_key text := regexp_replace(lower(coalesce(new.approval, '')), '[^a-z0-9]+', '', 'g');
  old_decided boolean := false;
  new_decided boolean := false;
  decision_fields_changed boolean := false;
begin
  new_decided := new_decision_key in ('approved', 'accepted', 'rejected', 'revisionrequired', 'revisionrequested', 'needsrevision');

  if tg_op = 'INSERT' then
    if new_decided and coalesce(requester_role, '') not in ('admin', 'committee') then
      raise exception 'Only Research Committee or Admin can make project decisions.' using errcode = '42501';
    end if;
    return new;
  end if;

  old_decision_key := regexp_replace(lower(coalesce(old.approval, '')), '[^a-z0-9]+', '', 'g');
  old_decided := old_decision_key in ('approved', 'accepted', 'rejected', 'revisionrequired', 'revisionrequested', 'needsrevision');

  decision_fields_changed :=
       new.approval is distinct from old.approval
    or new.status is distinct from old.status
    or new.committee_comments is distinct from old.committee_comments
    or new.decision_message is distinct from old.decision_message
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_by_name is distinct from old.reviewed_by_name
    or new.accepted_at is distinct from old.accepted_at;

  if decision_fields_changed and coalesce(requester_role, '') not in ('admin', 'committee') then
    raise exception 'Only Research Committee or Admin can make project decisions.' using errcode = '42501';
  end if;

  if old_decided and decision_fields_changed and coalesce(requester_role, '') <> 'admin' then
    raise exception 'This project already has a committee decision.' using errcode = '45000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_one_time_committee_project_decision on public.research_projects;
create trigger trg_one_time_committee_project_decision
before insert or update on public.research_projects
for each row execute function public.enforce_one_time_committee_project_decision();
