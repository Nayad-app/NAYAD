-- COALESCE is SQL syntax, not a schema-qualified pg_catalog function.
-- The previous schema-qualified call failed whenever the permission trigger
-- evaluated an authenticated write.
create or replace function private.enforce_store_module_permission()
returns trigger
language plpgsql
security definer
set search_path=''
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
  if not coalesce(v_allowed,false) then
    raise exception 'Permission denied for % %',v_module,pg_catalog.lower(tg_op);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.enforce_store_module_permission()
  from public, anon, authenticated;
