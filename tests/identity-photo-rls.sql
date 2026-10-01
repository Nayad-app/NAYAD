-- Isolated PostgreSQL fixture only. Never run this bootstrap against production.
create role authenticated;
create role anon;
create schema auth;
create schema private;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.stores(id uuid primary key,name text);
create table public.store_members(store_id uuid,user_id uuid,role text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
alter table storage.objects enable row level security;
alter table public.stores enable row level security;
grant usage on schema storage,private,auth to authenticated,anon;
grant select,insert,delete,update on storage.objects,public.stores to authenticated;
grant select on public.store_members to authenticated;
grant usage on sequence storage.objects_id_seq to authenticated;
create policy members_select on public.stores for select to authenticated using(exists(select 1 from public.store_members sm where sm.store_id=stores.id and sm.user_id=auth.uid()));
create policy owners_update on public.stores for update to authenticated using(exists(select 1 from public.store_members sm where sm.store_id=stores.id and sm.user_id=auth.uid() and sm.role='owner')) with check(exists(select 1 from public.store_members sm where sm.store_id=stores.id and sm.user_id=auth.uid() and sm.role='owner'));
insert into public.stores values ('22222222-2222-4222-8222-222222222222','Test'),('55555555-5555-4555-8555-555555555555','Other');
insert into public.store_members values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','owner'),('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','member');
-- APPLY MIGRATION HERE
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into storage.objects(bucket_id,name) values ('identity-photos','profiles/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'),('identity-photos','stores/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png');
update public.stores set photo_path='stores/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png' where id='22222222-2222-4222-8222-222222222222';
do $$begin
 if (select count(*) from storage.objects) <> 2 then raise exception 'Owner cannot read own files'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('identity-photos','profiles/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.png');
  raise exception 'Foreign profile upload allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('identity-photos','stores/55555555-5555-4555-8555-555555555555/33333333-3333-4333-8333-333333333333.png');
  raise exception 'Foreign store upload allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.stores set photo_path='stores/55555555-5555-4555-8555-555555555555/33333333-3333-4333-8333-333333333333.png' where id='22222222-2222-4222-8222-222222222222';
  raise exception 'Cross-store path allowed';
 exception when check_violation then null; end;
 if private.can_access_identity_photo('stores/not-a-uuid/file.png',true) then raise exception 'Malformed UUID accepted'; end if;
 if private.can_access_identity_photo('profiles/11111111-1111-4111-8111-111111111111/../../../x',true) then raise exception 'Traversal accepted'; end if;
end $$;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$declare n integer;begin
 if (select count(*) from storage.objects) <> 1 then raise exception 'Member visibility incorrect'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('identity-photos','stores/22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666.png');
  raise exception 'Member upload allowed';
 exception when insufficient_privilege then null; end;
 delete from storage.objects;get diagnostics n=row_count;if n<>0 then raise exception 'Member delete allowed';end if;
 update public.stores set photo_path=null;get diagnostics n=row_count;if n<>0 then raise exception 'Member photo update allowed';end if;
end $$;
set request.jwt.claim.sub='77777777-7777-4777-8777-777777777777';
do $$begin if (select count(*) from storage.objects)<>0 then raise exception 'Nonmember read allowed';end if;end $$;
reset role;
do $$begin
 if (select public from storage.buckets where id='identity-photos') then raise exception 'Bucket is public';end if;
 if has_function_privilege('anon','private.can_access_identity_photo(text,boolean)','execute') then raise exception 'Anonymous helper execution allowed';end if;
 if (select photo_path is null from public.stores where id='22222222-2222-4222-8222-222222222222') then raise exception 'Member altered owner picture';end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$declare n integer;begin
 update storage.objects set name=name;get diagnostics n=row_count;if n<>0 then raise exception 'In-place overwrite allowed';end if;
 delete from storage.objects;get diagnostics n=row_count;if n<>2 then raise exception 'Owner cleanup denied';end if;
end $$;
reset role;
