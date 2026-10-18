-- Account-owned private images, never shared through a public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,2097152,array['image/jpeg']);
create policy "Users read own profile photos" on storage.objects for select to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users upload own profile photos" on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users delete own profile photos" on storage.objects for delete to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
