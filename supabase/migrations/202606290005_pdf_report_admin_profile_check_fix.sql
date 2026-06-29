-- PDF Report Customization admin-profile check fix.
-- Run safe/idempotent. This fixes approved Admin accounts being rejected by the PDF settings save RPC.

create or replace function public.is_pdf_customization_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  with auth_context as (
    select
      auth.uid() as uid,
      lower(trim(coalesce(
        auth.jwt() ->> 'email',
        (select au.email from auth.users au where au.id = auth.uid()),
        ''
      ))) as email
  )
  select exists (
    select 1
    from public.profiles p
    cross join auth_context ac
    where lower(trim(coalesce(p.role, ''))) in ('admin', 'admin/editor')
      and coalesce(nullif(lower(trim(coalesce(p.status, ''))), ''), 'active') in ('active', 'approved')
      and (
        (ac.uid is not null and p.id = ac.uid)
        or (ac.email <> '' and lower(trim(coalesce(p.email, ''))) = ac.email)
      )
  );
$$;

grant execute on function public.is_pdf_customization_admin() to anon, authenticated;

create or replace function public.save_pdf_report_settings(next_value jsonb, updated_by_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to save PDF report settings.';
  end if;

  if not public.is_pdf_customization_admin() then
    raise exception 'Your Supabase login is not linked to an Active Admin profile. Please run the updated PDF SQL, refresh, then log out/in with the approved Admin email if needed.';
  end if;

  insert into public.app_settings as s (key, value, updated_by, updated_at)
  values (
    'pdf_report',
    coalesce(next_value, '{}'::jsonb),
    coalesce(updated_by_value, auth.jwt() ->> 'email', 'admin'),
    now()
  )
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning s.value into saved_value;

  return saved_value;
end;
$$;

grant execute on function public.save_pdf_report_settings(jsonb, text) to authenticated;
notify pgrst, 'reload schema';
