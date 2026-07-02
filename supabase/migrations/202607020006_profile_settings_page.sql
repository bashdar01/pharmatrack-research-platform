-- Profile Settings Page support
-- Safe/idempotent: adds profile fields, private update guard, and profile photo storage.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists program text;
alter table public.profiles add column if not exists profile_photo_url text;
alter table public.profiles add column if not exists profile_photo_path text;
alter table public.profiles add column if not exists updated_at timestamptz;

create or replace function public.prevent_unsafe_self_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_role text := public.current_profile_role();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  new.updated_at := now();

  -- Admin tools/RPCs may manage account-level fields. Normal users may not.
  if coalesce(requester_role, '') <> 'admin' then
    if new.email is distinct from old.email then
      raise exception 'Email cannot be changed from the profile page.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role then
      raise exception 'Role cannot be changed from the profile page.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Account status cannot be changed from the profile page.' using errcode = '42501';
    end if;
    if new.assigned_supervisor_id is distinct from old.assigned_supervisor_id
      or new.assigned_supervisor_email is distinct from old.assigned_supervisor_email
      or new.assigned_supervisor_name is distinct from old.assigned_supervisor_name
      or new.assigned_supervisor_email_sent_at is distinct from old.assigned_supervisor_email_sent_at
      or new.assigned_supervisor_email_supervisor_id is distinct from old.assigned_supervisor_email_supervisor_id
      or new.assigned_supervisor_email_supervisor_email is distinct from old.assigned_supervisor_email_supervisor_email then
      raise exception 'Supervisor assignment cannot be changed from the profile page.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_unsafe_self_profile_update on public.profiles;
create trigger trg_prevent_unsafe_self_profile_update
before update on public.profiles
for each row execute function public.prevent_unsafe_self_profile_update();

-- Replace older open update policy with own-profile/admin-safe policies.
drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "profiles_update_own_profile_settings" on public.profiles;
drop policy if exists "profiles_update_admin_all" on public.profiles;

create policy "profiles_update_own_profile_settings"
on public.profiles
for update
to authenticated
using (
  id = public.current_profile_id()
  or lower(coalesce(email, '')) = public.current_profile_email()
)
with check (
  id = public.current_profile_id()
  or lower(coalesce(email, '')) = public.current_profile_email()
);

create policy "profiles_update_admin_all"
on public.profiles
for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

grant select, update on public.profiles to authenticated;

-- Public profile photo bucket. Object paths should start with the profile id or auth uid.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
    allowed_mime_types = (
      select array_agg(distinct mime_type)
      from unnest(coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || excluded.allowed_mime_types) as t(mime_type)
    );

drop policy if exists "Public can view profile photos" on storage.objects;
create policy "Public can view profile photos"
on storage.objects
for select
to public
using (bucket_id = 'profile-photos');

drop policy if exists "Users can upload own profile photos" on storage.objects;
create policy "Users can upload own profile photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = coalesce(public.current_profile_id()::text, '')
    or (storage.foldername(name))[1] = coalesce(auth.uid()::text, '')
  )
);

drop policy if exists "Users can update own profile photos" on storage.objects;
create policy "Users can update own profile photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = coalesce(public.current_profile_id()::text, '')
    or (storage.foldername(name))[1] = coalesce(auth.uid()::text, '')
  )
)
with check (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = coalesce(public.current_profile_id()::text, '')
    or (storage.foldername(name))[1] = coalesce(auth.uid()::text, '')
  )
);

drop policy if exists "Users can delete own profile photos" on storage.objects;
create policy "Users can delete own profile photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = coalesce(public.current_profile_id()::text, '')
    or (storage.foldername(name))[1] = coalesce(auth.uid()::text, '')
  )
);

notify pgrst, 'reload schema';
