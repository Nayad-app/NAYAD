-- Separate the personal account from an explicitly completed NAYAD
-- registration. Legacy stores remain usable, while placeholders created by
-- the retired ensure_my_store() path must finish the approved onboarding.

alter table public.stores
  add column if not exists registration_completed_at timestamptz;

-- The completion marker is server-owned. Keep the existing editable company
-- fields available to owners through RLS, but do not let a REST update or
-- insert mark an unfinished registration as complete (or change its role).
revoke insert, update on table public.stores from anon, authenticated;
grant insert (
  id, name, phone, address, director, created_at,
  business_type, operation_role, entity_type
) on table public.stores to authenticated;
grant update (
  name, phone, address, director, business_type, entity_type
) on table public.stores to authenticated;

-- Preserve legacy registrations that have an explicitly selected type or real
-- operational evidence. Empty name-only placeholders remain incomplete and
-- must be completed by their owner, regardless of when they were created.
update public.stores
set registration_completed_at = coalesce(created_at, statement_timestamp())
where registration_completed_at is null
  and (
    (
      operation_role = 'buyer'
      and nullif(pg_catalog.btrim(business_type), '') is not null
    )
    or (
      operation_role = 'supplier'
      and entity_type = any (array['person', 'organization']::text[])
    )
    or exists (select 1 from public.suppliers x where x.store_id = public.stores.id)
    or exists (select 1 from public.invoices x where x.store_id = public.stores.id)
    or exists (select 1 from public.payments x where x.store_id = public.stores.id)
    or exists (select 1 from public.loans x where x.store_id = public.stores.id)
    or exists (select 1 from public.store_subscriptions x where x.store_id = public.stores.id)
    or exists (select 1 from public.qpay_orders x where x.store_id = public.stores.id)
    or exists (select 1 from public.store_invites x where x.store_id = public.stores.id)
    or exists (
      select 1
      from public.store_members x
      where x.store_id = public.stores.id
        and x.role <> 'owner'
    )
  );

-- Keep this legacy RPC callable for already-open cached clients, but make it
-- read-only. It must never turn a person's full_name into a store again.
create or replace function public.ensure_my_store()
returns table(id uuid, name text)
language sql
security invoker
set search_path = ''
as $$
  select s.id, s.name
  from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where sm.user_id = auth.uid()
    and sm.role = 'owner'
  order by (s.registration_completed_at is null), sm.created_at, s.id
  limit 1;
$$;

revoke all on function public.ensure_my_store()
from public, anon, authenticated;
grant execute on function public.ensure_my_store()
to authenticated;

-- Older cached clients can still use their explicit "add store" form. Treat
-- that user-confirmed buyer registration as complete instead of creating a new
-- unfinished row.
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
  if v_name is null or pg_catalog.char_length(v_name) > 80 then
    raise exception 'Invalid store name';
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

  if exists (
    select 1
    from public.stores s
    join public.store_members sm on sm.store_id = s.id
    where sm.user_id = v_user_id
      and sm.role = 'owner'
      and s.registration_completed_at is null
  ) then
    raise exception 'Finish the existing registration setup first';
  end if;

  select pg_catalog.count(*)::integer into v_owned_count
  from public.store_members sm
  where sm.user_id = v_user_id and sm.role = 'owner';
  if v_owned_count >= 20 then raise exception 'Store limit reached'; end if;

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

  insert into public.stores(
    name, business_type, operation_role, entity_type, registration_completed_at
  ) values (
    v_name, v_business_type, 'buyer', null, statement_timestamp()
  ) returning public.stores.id into v_store_id;

  insert into public.store_members(store_id, user_id, role)
  values (v_store_id, v_user_id, 'owner');

  return query select v_store_id, v_name, v_business_type;
end;
$$;

revoke all on function private.create_my_store_impl(text, text)
from public, anon, authenticated;
grant execute on function private.create_my_store_impl(text, text)
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

  if exists (
    select 1
    from public.stores s
    join public.store_members sm on sm.store_id = s.id
    where sm.user_id = v_user_id
      and sm.role = 'owner'
      and s.registration_completed_at is null
  ) then
    raise exception 'Finish the existing registration setup first';
  end if;

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

  insert into public.stores(
    name,
    operation_role,
    business_type,
    entity_type,
    registration_completed_at
  )
  values (
    v_name,
    v_operation_role,
    v_business_type,
    v_entity_type,
    statement_timestamp()
  )
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

create or replace function private.complete_my_registration_impl(
  p_store_id uuid,
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
  v_current_name text;
  v_current_operation_role text;
  v_current_business_type text;
  v_current_entity_type text;
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_store_id is null then
    raise exception 'Registration is required';
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

  select
    s.name,
    s.operation_role,
    s.business_type,
    s.entity_type,
    s.registration_completed_at
  into
    v_current_name,
    v_current_operation_role,
    v_current_business_type,
    v_current_entity_type,
    v_completed_at
  from public.stores s
  join public.store_members sm on sm.store_id = s.id
  where s.id = p_store_id
    and sm.user_id = v_user_id
    and sm.role = 'owner'
  for update of s, sm;

  if not found then
    raise exception 'Registration not found or owner access required';
  end if;

  if v_completed_at is not null then
    if v_current_name = v_name
      and v_current_operation_role = v_operation_role
      and v_current_business_type is not distinct from v_business_type
      and v_current_entity_type is not distinct from v_entity_type then
      return query
      select p_store_id, v_name, v_operation_role, v_business_type, v_entity_type;
      return;
    end if;
    raise exception 'Registration setup is already complete';
  end if;

  if exists (
    select 1
    from public.stores s
    join public.store_members sm on sm.store_id = s.id
    where sm.user_id = v_user_id
      and sm.role = 'owner'
      and s.id <> p_store_id
      and pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(v_name)
  ) then
    raise exception 'A store with this name already exists';
  end if;

  update public.stores
  set
    name = v_name,
    operation_role = v_operation_role,
    business_type = v_business_type,
    entity_type = v_entity_type,
    registration_completed_at = statement_timestamp()
  where public.stores.id = p_store_id;

  return query
  select p_store_id, v_name, v_operation_role, v_business_type, v_entity_type;
end;
$$;

revoke all on function private.complete_my_registration_impl(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function private.complete_my_registration_impl(uuid, text, text, text, text)
to authenticated;

create or replace function public.complete_my_registration(
  p_store_id uuid,
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
  from private.complete_my_registration_impl(
    p_store_id,
    p_name,
    p_operation_role,
    p_business_type,
    p_entity_type
  );
$$;

revoke all on function public.complete_my_registration(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.complete_my_registration(uuid, text, text, text, text)
to authenticated;

drop function if exists public.get_my_registrations();

create function public.get_my_registrations()
returns table(
  user_id uuid,
  id uuid,
  name text,
  role text,
  permissions jsonb,
  created_at timestamptz,
  operation_role text,
  business_type text,
  entity_type text,
  registration_completed_at timestamptz
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
    s.entity_type,
    s.registration_completed_at
  from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where sm.user_id = auth.uid()
  order by case when sm.role = 'owner' then 0 else 1 end, sm.created_at;
$$;

revoke all on function public.get_my_registrations()
from public, anon, authenticated;
grant execute on function public.get_my_registrations()
to authenticated;

-- Old clients must not be able to add a contact to an unfinished placeholder,
-- even if their UI still renders an add button.
create or replace function private.require_completed_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.store_id is distinct from new.store_id then
    raise exception 'A contact cannot be moved between registrations'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.stores s
    where s.id = new.store_id
      and s.registration_completed_at is not null
  ) then
    raise exception 'Registration setup is required' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.require_completed_registration()
from public, anon, authenticated;

drop trigger if exists require_completed_registration_before_supplier_write
on public.suppliers;
create trigger require_completed_registration_before_supplier_write
before insert or update on public.suppliers
for each row execute function private.require_completed_registration();

comment on column public.stores.registration_completed_at is
  'Set only after the owner explicitly finishes supplier/buyer onboarding.';
