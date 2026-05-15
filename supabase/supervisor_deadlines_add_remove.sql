-- PharmaTrack supervisor deadline add/remove support
-- Run this in Supabase SQL Editor if supervisors cannot add or remove deadlines.

alter table public.deadlines add column if not exists academic_year text default '2026-2027';
alter table public.deadlines add column if not exists status text default 'Active';

-- Allow authenticated/anon app users to delete deadlines in the current development policy model.
-- For stricter production security, replace this with a role-based policy using Supabase Auth claims.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deadlines'
      and policyname = 'deadlines_delete_authenticated'
  ) then
    create policy "deadlines_delete_authenticated"
    on public.deadlines
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;
