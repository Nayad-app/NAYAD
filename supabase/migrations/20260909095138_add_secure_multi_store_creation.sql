-- Let an authenticated account create additional, fully isolated stores.
-- Membership writes remain unavailable to clients; the privileged helper
-- accepts only the current auth.uid() and tightly validated store fields.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.create_my_store_impl(
  p_name text,
  p_business_type text
)
returns table(id uuid, name text, business_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_business_type text := nullif(pg_catalog.btrim(p_business_type), '');
  v_store_id uuid;
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_name is null then
    raise exception 'Store name is required';
  end if;
  if pg_catalog.char_length(v_name) > 80 then
    raise exception 'Store name is too long';
  end if;
  if v_business_type is null or not (
    v_business_type = any(array[
      'Жижиглэн худалдаа',
      'Бөөний худалдаа',
      'Хоол, хүнс',
      'Үйлчилгээ',
      'Онлайн худалдаа',
      'Бусад'
    ]::text[])
  ) then
    raise exception 'Invalid business type';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select pg_catalog.count(*)::integer
    into v_owned_count
  from public.store_members sm
  where sm.user_id = v_user_id
    and sm.role = 'owner';

  if v_owned_count >= 20 then
    raise exception 'Store limit reached';
  end if;

  if exists (
    select 1
    from public.stores s
    join public.store_members sm on sm.store_id = s.id
    where sm.user_id = v_user_id
      and sm.role = 'owner'
      and pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(v_name)
  ) then
    raise exception 'A store with this name already exists';
  end if;

  insert into public.stores(name, business_type)
  values (v_name, v_business_type)
  returning public.stores.id into v_store_id;

  insert into public.store_members(store_id, user_id, role)
  values (v_store_id, v_user_id, 'owner');

  return query
  select v_store_id, v_name, v_business_type;
end;
$$;

revoke all on function private.create_my_store_impl(text, text)
from public, anon, authenticated;
grant execute on function private.create_my_store_impl(text, text)
to authenticated;

create or replace function public.create_my_store(
  p_name text,
  p_business_type text
)
returns table(id uuid, name text, business_type text)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_my_store_impl(p_name, p_business_type);
$$;

revoke all on function public.create_my_store(text, text)
from public, anon, authenticated;
grant execute on function public.create_my_store(text, text)
to authenticated;
