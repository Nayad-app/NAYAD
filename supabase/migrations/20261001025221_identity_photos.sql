-- Optional private account/store pictures; existing records and balances are untouched.
alter table public.stores add column if not exists photo_path text;
alter table public.stores add constraint stores_photo_path_scope check (
  photo_path is null or photo_path ~ ('^stores/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
);
comment on column public.stores.photo_path is 'Private identity-photos object path, scoped to this store.';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('identity-photos','identity-photos',false,2097152,array['image/png','image/jpeg','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Private schema prevents the authorization helper from becoming a public RPC.
create or replace function private.can_access_identity_photo(p_name text,p_write boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_parts text[] := string_to_array(p_name,'/');
begin
  if v_uid is null or array_length(v_parts,1) <> 3 then return false; end if;
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  then return false; end if;
  if v_parts[1]='profiles' then return v_parts[2]=v_uid::text; end if;
  if v_parts[1]='stores' then
    return exists(select 1 from public.store_members sm where sm.store_id=v_parts[2]::uuid and sm.user_id=v_uid and (not p_write or sm.role='owner'));
  end if;
  return false;
end; $$;
revoke all on function private.can_access_identity_photo(text,boolean) from public,anon;
grant execute on function private.can_access_identity_photo(text,boolean) to authenticated;
create policy "Members can view identity photos" on storage.objects for select to authenticated
using (bucket_id='identity-photos' and private.can_access_identity_photo(name,false));
create policy "Owners can upload identity photos" on storage.objects for insert to authenticated
with check (bucket_id='identity-photos' and private.can_access_identity_photo(name,true));
create policy "Owners can delete identity photos" on storage.objects for delete to authenticated
using (bucket_id='identity-photos' and private.can_access_identity_photo(name,true));
-- No UPDATE policy: replacements always use a fresh random object path.
-- stores UPDATE already uses owner membership RLS with WITH CHECK.
