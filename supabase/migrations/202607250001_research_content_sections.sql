-- Research Learning Resources, Research Day, and Published Papers
-- Safe/idempotent. Run in Supabase SQL Editor or through Supabase migrations.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'research_day_status') then
    create type public.research_day_status as enum ('Draft', 'Published', 'Completed', 'Archived');
  end if;
end $$;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1;
$$;

grant execute on function public.current_profile_id() to anon, authenticated;

create or replace function public.current_research_profile_role()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select lower(trim(coalesce(p.role, '')))
  from public.profiles p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1;
$$;

grant execute on function public.current_research_profile_role() to anon, authenticated;

create or replace function public.is_research_content_manager()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(public.current_research_profile_role(), '') in ('admin', 'committee', 'research committee', 'research_committee');
$$;

grant execute on function public.is_research_content_manager() to anon, authenticated;

create or replace function public.is_research_supervisor()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(public.current_research_profile_role(), '') = 'supervisor';
$$;

grant execute on function public.is_research_supervisor() to anon, authenticated;

create table if not exists public.research_learning_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  resource_type text not null check (resource_type in ('youtube', 'external', 'pdf')),
  category text,
  youtube_url text,
  external_url text,
  pdf_url text,
  pdf_path text,
  thumbnail_url text,
  author_or_source text,
  publication_year integer,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_days (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text not null,
  description text,
  student_instructions text,
  supervisor_instructions text,
  contact_information text,
  external_url text,
  banner_url text,
  banner_path text,
  status public.research_day_status not null default 'Draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_days_time_order check (end_time is null or start_time is null or end_time >= start_time)
);

create table if not exists public.published_papers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text not null,
  corresponding_author text,
  journal_name text,
  publication_year integer,
  publication_date date,
  volume text,
  issue text,
  pages text,
  doi text,
  abstract text,
  keywords text,
  category text,
  external_url text,
  pdf_url text,
  pdf_path text,
  is_published boolean not null default false,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_papers_date_or_year check (publication_year is not null or publication_date is not null),
  constraint published_papers_pdf_or_link check (coalesce(nullif(external_url, ''), nullif(pdf_url, '')) is not null)
);

create index if not exists idx_research_learning_resources_published on public.research_learning_resources(is_published, category, resource_type);
create index if not exists idx_research_days_status_date on public.research_days(status, event_date);
create index if not exists idx_published_papers_published_year on public.published_papers(is_published, publication_year, category);
create index if not exists idx_published_papers_submitter on public.published_papers(submitted_by);

create or replace function public.touch_research_content_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_research_learning_resources_updated_at on public.research_learning_resources;
create trigger trg_touch_research_learning_resources_updated_at
before update on public.research_learning_resources
for each row execute function public.touch_research_content_updated_at();

drop trigger if exists trg_touch_research_days_updated_at on public.research_days;
create trigger trg_touch_research_days_updated_at
before update on public.research_days
for each row execute function public.touch_research_content_updated_at();

drop trigger if exists trg_touch_published_papers_updated_at on public.published_papers;
create trigger trg_touch_published_papers_updated_at
before update on public.published_papers
for each row execute function public.touch_research_content_updated_at();

alter table public.research_learning_resources enable row level security;
alter table public.research_days enable row level security;
alter table public.published_papers enable row level security;

grant select, insert, update, delete on public.research_learning_resources to authenticated;
grant select, insert, update, delete on public.research_days to authenticated;
grant select, insert, update, delete on public.published_papers to authenticated;

drop policy if exists "research_resources_read" on public.research_learning_resources;
drop policy if exists "research_resources_manage" on public.research_learning_resources;
create policy "research_resources_read"
on public.research_learning_resources
for select
to authenticated
using (is_published = true or public.is_research_content_manager());
create policy "research_resources_manage"
on public.research_learning_resources
for all
to authenticated
using (public.is_research_content_manager())
with check (public.is_research_content_manager());

drop policy if exists "research_days_read" on public.research_days;
drop policy if exists "research_days_manage" on public.research_days;
create policy "research_days_read"
on public.research_days
for select
to authenticated
using (status in ('Published', 'Completed', 'Archived') or public.is_research_content_manager());
create policy "research_days_manage"
on public.research_days
for all
to authenticated
using (public.is_research_content_manager())
with check (public.is_research_content_manager());

drop policy if exists "published_papers_read" on public.published_papers;
drop policy if exists "published_papers_insert" on public.published_papers;
drop policy if exists "published_papers_update" on public.published_papers;
drop policy if exists "published_papers_delete" on public.published_papers;
create policy "published_papers_read"
on public.published_papers
for select
to authenticated
using (
  is_published = true
  or public.is_research_content_manager()
  or submitted_by = public.current_profile_id()
);
create policy "published_papers_insert"
on public.published_papers
for insert
to authenticated
with check (
  public.is_research_content_manager()
  or (public.is_research_supervisor() and submitted_by = public.current_profile_id() and is_published = false)
);
create policy "published_papers_update"
on public.published_papers
for update
to authenticated
using (
  public.is_research_content_manager()
  or (public.is_research_supervisor() and submitted_by = public.current_profile_id())
)
with check (
  public.is_research_content_manager()
  or (public.is_research_supervisor() and submitted_by = public.current_profile_id())
);
create policy "published_papers_delete"
on public.published_papers
for delete
to authenticated
using (
  public.is_research_content_manager()
  or (public.is_research_supervisor() and submitted_by = public.current_profile_id())
);

-- Storage bucket for PDFs and optional Research Day images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-content',
  'research-content',
  true,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "research_content_public_read" on storage.objects;
drop policy if exists "research_content_insert" on storage.objects;
drop policy if exists "research_content_update" on storage.objects;
drop policy if exists "research_content_delete" on storage.objects;

create policy "research_content_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'research-content');

create policy "research_content_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'research-content'
  and (
    public.is_research_content_manager()
    or public.is_research_supervisor()
  )
);

create policy "research_content_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'research-content'
  and (
    public.is_research_content_manager()
    or public.is_research_supervisor()
  )
)
with check (bucket_id = 'research-content');

create policy "research_content_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'research-content'
  and (
    public.is_research_content_manager()
    or public.is_research_supervisor()
  )
);

commit;
