-- Read the current invoice amount without modifying immutable audit history.
create or replace function private.statement_entries(p_store uuid,p_id text default null)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'kind','payment','supplier_id',p.supplier_id,'supplier_name',s.name,'amount',p.amount,'payment_date',p.payment_date,'created_at',p.created_at,'created_by',p.created_by,'note',p.note,'reference',p.reference,'method',p.method,'invoice_id',p.invoice_id,'status',p.status)
 from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'payments','view')) and p.store_id=p_store and p.status='posted' and (p_id is null or p.id::text=p_id)
 union all
 select jsonb_build_object('id','invoice:'||i.id,'entity_id',i.id,'kind','invoice','supplier_id',i.supplier_id,'supplier_name',s.name,'amount',i.amount,'invoice_no',i.invoice_no,'invoice_date',i.invoice_date,'created_at',i.created_at,'created_by',i.created_by,'note',i.note,'status',i.status)
 from public.invoices i left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'invoices','view')) and i.store_id=p_store and (p_id is null or 'invoice:'||i.id=p_id)
 and not exists(select 1 from public.finance_audit_events a where a.store_id=p_store and a.entity_id=i.id and a.entity_type='invoice_history' and a.action='insert')
 union all
 select jsonb_build_object('id','audit:'||a.id,'entity_id',a.entity_id,'kind','invoice','supplier_id',coalesce(a.details->>'supplier_id',i.supplier_id::text),'supplier_name',coalesce(a.details->>'supplier_name',s.name),'amount',case when i.id is not null then to_jsonb(i.amount) else a.details#>'{after,amount}' end,'invoice_no',coalesce(a.details#>>'{after,invoice_no}',i.invoice_no),'invoice_date',a.details#>>'{after,invoice_date}','created_at',a.created_at,'created_by',a.actor_id,'note',a.details#>>'{after,note}')
 from public.finance_audit_events a left join public.invoices i on i.id=a.entity_id and i.store_id=p_store left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'invoices','view')) and a.store_id=p_store and a.entity_type='invoice_history' and a.action='insert' and (p_id is null or 'audit:'||a.id=p_id);
$$;
