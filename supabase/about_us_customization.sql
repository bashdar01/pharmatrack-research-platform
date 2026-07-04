-- About Us page customization for the main website
-- Safe/idempotent: can be run multiple times.
-- Keeps all user accounts/profiles intact.

begin;

create extension if not exists pgcrypto;

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  title text not null default '',
  subtitle text,
  content_html text,
  content_json jsonb not null default '{}'::jsonb,
  image_url text,
  is_published boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.site_pages add column if not exists page_key text;
alter table public.site_pages add column if not exists title text not null default '';
alter table public.site_pages add column if not exists subtitle text;
alter table public.site_pages add column if not exists content_html text;
alter table public.site_pages add column if not exists content_json jsonb not null default '{}'::jsonb;
alter table public.site_pages add column if not exists image_url text;
alter table public.site_pages add column if not exists is_published boolean not null default true;
alter table public.site_pages add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.site_pages add column if not exists updated_at timestamptz not null default now();
alter table public.site_pages add column if not exists created_at timestamptz not null default now();

create unique index if not exists site_pages_page_key_key on public.site_pages(page_key);
create index if not exists idx_site_pages_published on public.site_pages(page_key, is_published);

create or replace function public.touch_site_pages_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_site_pages_updated_at on public.site_pages;
create trigger trg_touch_site_pages_updated_at
before update on public.site_pages
for each row execute function public.touch_site_pages_updated_at();

insert into public.site_pages (page_key, title, subtitle, content_html, content_json, is_published)
values (
  'about_us',
  'About Us',
  'College of Pharmacy Research Platform',
  '<h2>About the Platform</h2><p>The College of Pharmacy Research Platform supports students, supervisors, research committee members, and administrators in managing research projects, weekly reports, deadlines, questions, and academic progress in one secure system.</p><p>Use the admin subdomain to customize this page for your college or department.</p>',
  '{}'::jsonb,
  true
)
on conflict (page_key) do nothing;

alter table public.site_pages enable row level security;

drop policy if exists "Published About Us readable by authenticated users" on public.site_pages;
drop policy if exists "Admins can read all site pages" on public.site_pages;
drop policy if exists "Admins can insert site pages" on public.site_pages;
drop policy if exists "Admins can update site pages" on public.site_pages;
drop policy if exists "Admins can delete site pages" on public.site_pages;
drop policy if exists "site_pages_read_published" on public.site_pages;
drop policy if exists "site_pages_admin_all" on public.site_pages;

create policy "site_pages_read_published"
on public.site_pages
for select
to authenticated
using (
  is_published = true
  or exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

create policy "site_pages_admin_all"
on public.site_pages
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

grant select on public.site_pages to authenticated;
grant insert, update, delete on public.site_pages to authenticated;

-- Optional image support for the About Us editor. Uses the existing app-assets bucket.
insert into storage.buckets (id, name, public)
values ('app-assets', 'app-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read app assets" on storage.objects;
drop policy if exists "Admins upload app assets" on storage.objects;
drop policy if exists "Admins update app assets" on storage.objects;
drop policy if exists "Admins delete app assets" on storage.objects;

create policy "Public read app assets"
on storage.objects
for select
to public
using (bucket_id = 'app-assets');

create policy "Admins upload app assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-assets'
  and exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

create policy "Admins update app assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-assets'
  and exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (bucket_id = 'app-assets');

create policy "Admins delete app assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-assets'
  and exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

notify pgrst, 'reload schema';

commit;
