-- Store the business information collected during sign-up and let only the
-- owner of a store update that information later from Profile settings.
alter table public.stores
  add column if not exists business_type text;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = (select auth.uid())
      and sm.role = 'owner'
  );
$$;

create or replace function public.ensure_my_store()
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_store_name text;
  v_business_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select s.id, s.name
    into v_store_id, v_store_name
  from public.stores s
  join public.store_members sm on sm.store_id = s.id
  where sm.user_id = v_user_id
    and sm.role = 'owner'
  order by s.created_at asc
  limit 1;

  if v_store_id is null then
    select
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'store_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(u.email, '@', 1), ''),
        'NAYAD'
      ),
      nullif(btrim(u.raw_user_meta_data ->> 'business_type'), '')
      into v_store_name, v_business_type
    from auth.users u
    where u.id = v_user_id;

    v_store_id := gen_random_uuid();

    insert into public.stores (id, name, business_type)
    values (v_store_id, coalesce(v_store_name, 'NAYAD'), v_business_type);

    insert into public.store_members (store_id, user_id, role)
    values (v_store_id, v_user_id, 'owner');
  end if;

  return query select v_store_id, v_store_name;
end;
$$;

drop policy if exists "Members can update their stores" on public.stores;
create policy "Owners can update their stores"
on public.stores
for update
to authenticated
using ((select public.is_store_owner(id)))
with check ((select public.is_store_owner(id)));

revoke all on function public.is_store_owner(uuid) from public, anon;
grant execute on function public.is_store_owner(uuid) to authenticated;

revoke all on function public.ensure_my_store() from public, anon, authenticated;
grant execute on function public.ensure_my_store() to authenticated;
