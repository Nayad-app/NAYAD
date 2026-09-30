-- Store only keyed hashes of authentication identifiers. Raw IP addresses,
-- phone numbers and email addresses must never be written to this table.
create table if not exists public.auth_rate_limits (
  action text not null,
  key_hash text not null,
  window_start timestamptz not null default pg_catalog.now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (action, key_hash),
  constraint auth_rate_limits_action_length check (pg_catalog.length(action) between 1 and 80),
  constraint auth_rate_limits_hash_shape check (key_hash ~ '^[0-9a-f]{64}$')
);

alter table public.auth_rate_limits enable row level security;
revoke all on table public.auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

create or replace function public.consume_auth_rate_limit(
  p_action text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.auth_rate_limits%rowtype;
begin
  if pg_catalog.length(p_action) not between 1 and 80
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 604800
     or p_block_seconds not between 1 and 604800 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into public.auth_rate_limits(action,key_hash,window_start,attempts,updated_at)
  values (p_action,p_key_hash,v_now,0,v_now)
  on conflict (action,key_hash) do nothing;

  select * into v_row
  from public.auth_rate_limits
  where action=p_action and key_hash=p_key_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query select false,
      pg_catalog.greatest(1,pg_catalog.ceil(extract(epoch from v_row.blocked_until-v_now))::integer);
    return;
  end if;

  if v_row.window_start <= v_now-pg_catalog.make_interval(secs=>p_window_seconds) then
    update public.auth_rate_limits
    set window_start=v_now,attempts=1,blocked_until=null,updated_at=v_now
    where action=p_action and key_hash=p_key_hash;
    return query select true,0;
    return;
  end if;

  if v_row.attempts+1 > p_limit then
    update public.auth_rate_limits
    set attempts=attempts+1,
        blocked_until=v_now+pg_catalog.make_interval(secs=>p_block_seconds),
        updated_at=v_now
    where action=p_action and key_hash=p_key_hash;
    return query select false,p_block_seconds;
    return;
  end if;

  update public.auth_rate_limits
  set attempts=attempts+1,updated_at=v_now
  where action=p_action and key_hash=p_key_hash;
  return query select true,0;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text,text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text,text,integer,integer,integer)
  to service_role;

-- This function is a trigger implementation, not a public RPC. PostgreSQL
-- grants EXECUTE to PUBLIC by default unless it is explicitly revoked.
revoke all on function public.handle_new_user_profile()
  from public, anon, authenticated;

-- A payments editor needs to update only an invoice's settlement total. They
-- must not be able to alter its supplier, amount, date, status or attachments.
create or replace function private.enforce_store_module_permission()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_row jsonb := case when tg_op='DELETE' then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  v_store_id uuid;
  v_module text := tg_argv[0];
  v_allowed boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='invoice_images' then
    select i.store_id into v_store_id from public.invoices i where i.id::text=v_row->>'invoice_id';
  else
    v_store_id := nullif(v_row->>'store_id','')::uuid;
  end if;
  if tg_op='DELETE' then
    v_allowed := private.has_store_permission(v_store_id,v_module,'owner');
  elsif tg_table_name='invoices' and tg_op='UPDATE' then
    v_allowed := private.has_store_permission(v_store_id,'invoices','edit')
      or (
        private.has_store_permission(v_store_id,'payments','edit')
        and (pg_catalog.to_jsonb(new)-'paid'-'updated_at')
          = (pg_catalog.to_jsonb(old)-'paid'-'updated_at')
      );
  else
    v_allowed := private.has_store_permission(v_store_id,v_module,'edit');
  end if;
  if not pg_catalog.coalesce(v_allowed,false) then
    raise exception 'Permission denied for % %',v_module,pg_catalog.lower(tg_op);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.enforce_store_module_permission() from public, anon, authenticated;
