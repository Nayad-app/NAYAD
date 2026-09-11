-- Keep the existing store data model and accounting tables intact while
-- recording which approved NAYAD workflow each owned registration uses.
alter table public.stores
  add column if not exists operation_role text not null default 'buyer',
  add column if not exists entity_type text;

alter table public.stores
  drop constraint if exists stores_operation_role_check,
  add constraint stores_operation_role_check
    check (operation_role = any (array['supplier', 'buyer']::text[])),
  drop constraint if exists stores_entity_type_check,
  add constraint stores_entity_type_check
    check (entity_type is null or entity_type = any (array['person', 'organization']::text[]));

-- A new read RPC carries the registration metadata without changing the
-- return type of get_my_stores_with_permissions(), which keeps older cached
-- web clients compatible during deployment.
create or replace function public.get_my_registrations()
returns table(
  user_id uuid,
  id uuid,
  name text,
  role text,
  permissions jsonb,
  created_at timestamptz,
  operation_role text,
  business_type text,
  entity_type text
)
language sql
security invoker
set search_path = ''
as $$
  select
    auth.uid(),
    s.id,
    s.name,
    sm.role,
    private.normalize_store_permissions(sm.permissions),
    sm.created_at,
    s.operation_role,
    s.business_type,
    s.entity_type
  from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where sm.user_id = auth.uid()
  order by case when sm.role = 'owner' then 0 else 1 end, sm.created_at;
$$;

revoke all on function public.get_my_registrations()
from public, anon, authenticated;
grant execute on function public.get_my_registrations()
to authenticated;

create or replace function private.create_my_registration_impl(
  p_name text,
  p_operation_role text,
  p_business_type text,
  p_entity_type text
)
returns table(
  id uuid,
  name text,
  operation_role text,
  business_type text,
  entity_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_operation_role text := nullif(pg_catalog.btrim(p_operation_role), '');
  v_business_type text := nullif(pg_catalog.btrim(p_business_type), '');
  v_entity_type text := nullif(pg_catalog.btrim(p_entity_type), '');
  v_store_id uuid;
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_name is null then
    raise exception 'Registration name is required';
  end if;
  if pg_catalog.char_length(v_name) > 80 then
    raise exception 'Registration name is too long';
  end if;
  if v_operation_role is null or v_operation_role not in ('supplier', 'buyer') then
    raise exception 'Invalid operation role';
  end if;

  if v_operation_role = 'supplier' then
    if v_entity_type is null or v_entity_type not in ('person', 'organization') then
      raise exception 'Invalid supplier type';
    end if;
    v_business_type := null;
  else
    if v_business_type is null or pg_catalog.char_length(v_business_type) > 80 then
      raise exception 'Invalid business type';
    end if;
    v_entity_type := null;
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

  insert into public.stores(name, operation_role, business_type, entity_type)
  values (v_name, v_operation_role, v_business_type, v_entity_type)
  returning public.stores.id into v_store_id;

  insert into public.store_members(store_id, user_id, role)
  values (v_store_id, v_user_id, 'owner');

  return query
  select v_store_id, v_name, v_operation_role, v_business_type, v_entity_type;
end;
$$;

revoke all on function private.create_my_registration_impl(text, text, text, text)
from public, anon, authenticated;
grant execute on function private.create_my_registration_impl(text, text, text, text)
to authenticated;

create or replace function public.create_my_registration(
  p_name text,
  p_operation_role text,
  p_business_type text,
  p_entity_type text
)
returns table(
  id uuid,
  name text,
  operation_role text,
  business_type text,
  entity_type text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_my_registration_impl(
    p_name,
    p_operation_role,
    p_business_type,
    p_entity_type
  );
$$;

revoke all on function public.create_my_registration(text, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_my_registration(text, text, text, text)
to authenticated;
