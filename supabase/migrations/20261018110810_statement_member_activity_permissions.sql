-- Resolve actors only for activities the caller may view in this store.
create or replace function private.statement_activity(p_store uuid,p_from date,p_to date)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  can_invoices boolean := private.has_store_permission(p_store,'invoices','view');
  can_payments boolean := private.has_store_permission(p_store,'payments','view');
begin
  if auth.uid() is null or not (can_invoices or can_payments) then
    return;
  end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range'; end if;
  return query
  with events as (
    select 'invoice:'||i.id::text as key,i.created_at as at,i.created_by as actor,
      jsonb_build_object('id','invoice:'||i.id,'entity_id',i.id,'kind','invoice','action','insert','supplier_id',i.supplier_id,'supplier_name',s.name,'amount',i.amount,'invoice_no',i.invoice_no,'invoice_date',i.invoice_date,'created_at',i.created_at,'note',i.note,'status',i.status) as body
    from public.invoices i left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
    where can_invoices and i.store_id=p_store and i.created_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and i.created_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
      and not exists(select 1 from public.finance_audit_events a where a.store_id=p_store and a.entity_id=i.id and a.entity_type='invoice_history' and a.action='insert')
    union all
    select 'audit:'||a.id,a.created_at,a.actor_id,
      jsonb_build_object('id','audit:'||a.id,'entity_id',a.entity_id,'kind',case when a.action='insert' then 'invoice' else 'change' end,'action',a.action,
        'supplier_id',coalesce(a.details->>'supplier_id',i.supplier_id::text),
        'supplier_name',coalesce(a.details->>'supplier_name',s.name),
        'amount',coalesce(a.details#>'{after,amount}',a.details#>'{before,amount}',a.details->'amount'),
        'invoice_no',coalesce(a.details#>>'{after,invoice_no}',a.details#>>'{before,invoice_no}',i.invoice_no),
        'created_at',a.created_at,'before',a.details->'before','after',a.details->'after','note',a.details->>'reason')
    from public.finance_audit_events a
    left join public.invoices i on i.id=a.entity_id and i.store_id=p_store
    left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
    where can_invoices and a.store_id=p_store and a.created_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and a.created_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
      and (a.entity_type='invoice_history' or (a.entity_type in ('invoice','invoice_deletion') and a.action in ('confirmed_edited','revised','cancelled','deleted','draft_deleted','draft_updated')
        and not exists(select 1 from public.finance_audit_events h where h.store_id=p_store and h.entity_id=a.entity_id and h.entity_type='invoice_history' and h.created_at=a.created_at)))
    union all
    select 'reversal:'||p.id,p.reversed_at,p.reversed_by,
      jsonb_build_object('id','reversal:'||p.id,'entity_id',p.id,'kind','change','action','payment_reversed','supplier_id',p.supplier_id,'supplier_name',s.name,'amount',p.amount,'created_at',p.reversed_at,'note',p.reversal_reason)
    from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.store_id=p_store
    where can_payments and p.store_id=p_store and p.status='reversed' and p.reversed_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and p.reversed_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
    union all
    -- Actor-only rows enrich the existing payment statement without duplicating payments.
    select 'actor:'||p.id,p.created_at,p.created_by,
      jsonb_build_object('id',p.id,'kind','payment_actor','created_at',p.created_at)
    from public.payments p where can_payments and p.store_id=p_store and p.payment_date between p_from and p_to
  )
  select e.body||jsonb_build_object('actor_name',pr.full_name)
  from events e left join public.profiles pr on pr.id=e.actor
  order by e.at desc nulls last,e.key desc;
end $$;
revoke all on function private.statement_activity(uuid,date,date) from public,anon;
grant execute on function private.statement_activity(uuid,date,date) to authenticated;
