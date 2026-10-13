-- Removing unpaid schedule rows is an edit, not deletion of the parent loan.
-- Direct installment DELETE remains ungranted; RPCs enforce locks, revisions,
-- membership and paid-history preservation before touching schedule rows.
do $$
declare original text; updated text;
begin
  original := pg_get_functiondef('private.enforce_store_module_permission()'::regprocedure);
  updated := replace(original,
    'if tg_op=''DELETE'' then' || chr(10) || '    v_allowed := private.has_store_permission(v_store_id,v_module,''owner'');',
    'if tg_op=''DELETE'' and tg_table_schema=''public'' and tg_table_name=''loan_installments''
    and v_row->>''status''=''pending'' and coalesce((v_row->>''paid_amount'')::numeric,0)=0
    and exists(select 1 from public.loans l where l.id=(v_row->>''loan_id'')::uuid and l.store_id=v_store_id)
  then
    v_allowed := private.has_store_permission(v_store_id,''loans'',''edit'');
  elsif tg_op=''DELETE'' then
    v_allowed := private.has_store_permission(v_store_id,v_module,''owner'');');
  if updated=original then raise exception 'Unexpected permission trigger definition'; end if;
  execute updated;
end;
$$;
