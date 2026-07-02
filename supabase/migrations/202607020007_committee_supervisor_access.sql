-- Admin-controlled Research Committee + Supervisor access.
-- Safe/idempotent. Run once in Supabase SQL Editor after deploying the frontend.

begin;

alter table public.profiles add column if not exists can_act_as_supervisor boolean not null default false;
alter table public.profiles add column if not exists secondary_roles text[] not null default array[]::text[];
alter table public.profiles add column if not exists updated_at timestamptz;

alter table public.audit_logs
  add column if not exists actor_id uuid,
  add column if not exists actor_email text,
  add column if not exists actor_role text,
  add column if not exists action_type text,
  add column if not exists affected_entity text,
  add column if not exists affected_user_id uuid,
  add column if not exists affected_project_id uuid,
  add column if not exists affected_report_id uuid,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists description text,
  add column if not exists details jsonb;

create or replace function public.current_admin_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(auth.jwt() ->> 'email')
    and coalesce(p.status, 'Pending') = 'Active'
    and p.role = 'admin'
  limit 1;
$$;

grant execute on function public.current_admin_profile_id() to authenticated;

create or replace function public.enforce_committee_supervisor_access_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_admin_profile_id();
begin
  if tg_op = 'INSERT' then
    if coalesce(new.can_act_as_supervisor, false) and admin_id is null then
      raise exception 'Only Admin can enable committee supervisor access.' using errcode = '42501';
    end if;
  else
    if (
      new.can_act_as_supervisor is distinct from old.can_act_as_supervisor
      or coalesce(new.secondary_roles, array[]::text[]) is distinct from coalesce(old.secondary_roles, array[]::text[])
    ) and admin_id is null then
      raise exception 'Only Admin can update committee supervisor access.' using errcode = '42501';
    end if;
  end if;

  if coalesce(new.can_act_as_supervisor, false) and new.role <> 'committee' then
    raise exception 'Supervisor access can only be enabled for Research Committee users.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_committee_supervisor_access_admin_only on public.profiles;
create trigger trg_enforce_committee_supervisor_access_admin_only
before insert or update of can_act_as_supervisor, secondary_roles, role on public.profiles
for each row execute function public.enforce_committee_supervisor_access_admin_only();

create or replace function public.admin_set_committee_supervisor_access(
  target_profile_id uuid,
  enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_admin_profile_id();
  admin_record public.profiles%rowtype;
  target_record public.profiles%rowtype;
  updated_record public.profiles%rowtype;
  next_roles text[];
  old_status text;
  new_status text;
begin
  if admin_id is null then
    raise exception 'Only admin can update dual-role supervisor access.' using errcode = '42501';
  end if;

  select * into admin_record from public.profiles where id = admin_id;
  select * into target_record from public.profiles where id = target_profile_id;

  if target_record.id is null then
    raise exception 'Research Committee user not found.';
  end if;

  if target_record.role <> 'committee' then
    raise exception 'Supervisor access can only be changed for Research Committee users.';
  end if;

  old_status := case when coalesce(target_record.can_act_as_supervisor, false) then 'Research Committee + Supervisor Access' else 'Research Committee only' end;

  next_roles := coalesce(target_record.secondary_roles, array[]::text[]);
  if enabled then
    if not ('supervisor' = any(next_roles)) then
      next_roles := array_append(next_roles, 'supervisor');
    end if;
  else
    next_roles := array(select role_value from unnest(next_roles) role_value where lower(role_value) <> 'supervisor');
  end if;

  update public.profiles
  set can_act_as_supervisor = coalesce(enabled, false),
      secondary_roles = coalesce(next_roles, array[]::text[]),
      updated_at = now()
  where id = target_profile_id
  returning * into updated_record;

  new_status := case when coalesce(updated_record.can_act_as_supervisor, false) then 'Research Committee + Supervisor Access' else 'Research Committee only' end;

  insert into public.audit_logs (
    actor,
    actor_id,
    actor_email,
    actor_role,
    action,
    action_type,
    entity,
    affected_entity,
    affected_user_id,
    old_value,
    new_value,
    description,
    details,
    created_at
  ) values (
    coalesce(admin_record.full_name, admin_record.email, 'Admin'),
    admin_record.id,
    admin_record.email,
    admin_record.role,
    case when enabled then 'enabled supervisor access for' else 'disabled supervisor access for' end,
    case when enabled then 'committee_supervisor_access_enabled' else 'committee_supervisor_access_disabled' end,
    coalesce(target_record.full_name, target_record.email, target_profile_id::text),
    'profile',
    target_record.id,
    to_jsonb(old_status),
    to_jsonb(new_status),
    concat(coalesce(admin_record.full_name, admin_record.email, 'Admin'), case when enabled then ' enabled' else ' disabled' end, ' Supervisor access for ', coalesce(target_record.full_name, target_record.email, 'Research Committee user'), '.'),
    jsonb_build_object('target_email', target_record.email, 'enabled', enabled),
    now()
  );

  insert into public.notifications (
    profile_id,
    recipient_user_id,
    recipient_email,
    sender_user_id,
    notification_type,
    title,
    message,
    type,
    target_role,
    is_read,
    created_at
  ) values (
    target_record.id,
    target_record.id,
    target_record.email,
    admin_record.id,
    concat('committee_supervisor_access_', target_record.id, '_', case when enabled then 'enabled' else 'disabled' end),
    case when enabled then 'Supervisor Access Enabled' else 'Supervisor Access Disabled' end,
    case when enabled then 'Admin enabled Supervisor mode for your Research Committee account. Use the View as dropdown to switch dashboards.' else 'Admin disabled Supervisor mode for your Research Committee account.' end,
    'Dual Role Management',
    'committee',
    false,
    now()
  );

  return updated_record;
end;
$$;

grant execute on function public.admin_set_committee_supervisor_access(uuid, boolean) to authenticated;

commit;
