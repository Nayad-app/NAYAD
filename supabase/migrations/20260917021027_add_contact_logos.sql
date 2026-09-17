-- Optional organization logos for contacts. Files stay private and are
-- readable only by registration members who can view customers.

alter table public.suppliers
  add column if not exists logo_path text;

comment on column public.suppliers.logo_path is
  'Private contact-logos Storage path. The first folder is the owning store UUID.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-logos',
  'contact-logos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Permitted members can view contact logos" on storage.objects;
create policy "Permitted members can view contact logos"
on storage.objects for select to authenticated
using (
  bucket_id = 'contact-logos'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(
    ((storage.foldername(name))[1])::uuid,
    'customers',
    'view'
  )
);

drop policy if exists "Permitted members can upload contact logos" on storage.objects;
create policy "Permitted members can upload contact logos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'contact-logos'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(
    ((storage.foldername(name))[1])::uuid,
    'customers',
    'edit'
  )
);

drop policy if exists "Permitted members can delete contact logos" on storage.objects;
create policy "Permitted members can delete contact logos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'contact-logos'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(
    ((storage.foldername(name))[1])::uuid,
    'customers',
    'edit'
  )
);

