-- Login page image upload storage setup.
-- Run this once in Supabase SQL Editor so the Admin Panel can upload login background/logo images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Anyone can view public login assets.
drop policy if exists "Public can view app assets" on storage.objects;
create policy "Public can view app assets"
on storage.objects
for select
using (bucket_id = 'app-assets');

-- Approved admins can upload login page assets.
drop policy if exists "Admins can upload app assets" on storage.objects;
create policy "Admins can upload app assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-assets'
  and exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and lower(p.role) in ('admin', 'admin/editor')
      and lower(coalesce(p.status, 'pending')) in ('active', 'approved')
  )
);

-- Approved admins can replace/update uploaded assets.
drop policy if exists "Admins can update app assets" on storage.objects;
create policy "Admins can update app assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-assets'
  and exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and lower(p.role) in ('admin', 'admin/editor')
      and lower(coalesce(p.status, 'pending')) in ('active', 'approved')
  )
)
with check (
  bucket_id = 'app-assets'
  and exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and lower(p.role) in ('admin', 'admin/editor')
      and lower(coalesce(p.status, 'pending')) in ('active', 'approved')
  )
);

-- Approved admins can remove uploaded assets if needed.
drop policy if exists "Admins can delete app assets" on storage.objects;
create policy "Admins can delete app assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-assets'
  and exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and lower(p.role) in ('admin', 'admin/editor')
      and lower(coalesce(p.status, 'pending')) in ('active', 'approved')
  )
);
