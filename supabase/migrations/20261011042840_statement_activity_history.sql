-- Immutable invoice snapshots survive invoice deletion; clients cannot write audit rows.
create or replace function private.capture_statement_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b jsonb; a jsonb; r jsonb; label text;
begin
  if tg_op <> 'INSERT' then
    b := jsonb_build_object('amount',old.amount,'invoice_no',old.invoice_no,'invoice_date',old.invoice_date,'due_date',old.due_date,'note',old.note,'status',old.status,'discount_percent',old.discount_percent,'discount_deadline',old.discount_deadline,'image_url',old.image_url,'supplier_id',old.supplier_id);
  end if;
  if tg_op <> 'DELETE' then
    a := jsonb_build_object('amount',new.amount,'invoice_no',new.invoice_no,'invoice_date',new.invoice_date,'due_date',new.due_date,'note',new.note,'status',new.status,'discount_percent',new.discount_percent,'discount_deadline',new.discount_deadline,'image_url',new.image_url,'supplier_id',new.supplier_id);
  end if;
  if tg_op='UPDATE' and a=b then return new; end if;
  r := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- Store/account deletion is handled by the existing cascade and must remain possible.
  if not exists(select 1 from public.stores s where s.id=(r->>'store_id')::uuid) then return null; end if;
  select s.name into label from public.suppliers s where s.id=(r->>'supplier_id')::uuid;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values((r->>'store_id')::uuid,'invoice_history',(r->>'id')::uuid,lower(tg_op),auth.uid(),
    jsonb_build_object('before',b,'after',a,'supplier_id',r->>'supplier_id','supplier_name',label));
  return null;
end $$;
revoke all on function private.capture_statement_invoice() from public,anon,authenticated;
create trigger statement_invoice_history after insert or update or delete on public.invoices
for each row execute function private.capture_statement_invoice();

-- Private privileged reader is needed only to resolve actor names. Check ownership first.
create or replace function private.statement_activity(p_store uuid,p_from date,p_to date)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store and sm.user_id=auth.uid() and sm.role='owner') then
    return;
  end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range'; end if;
  return query
  with events as (
    select 'invoice:'||i.id::text as key,i.created_at as at,i.created_by as actor,
      jsonb_build_object('id','invoice:'||i.id,'entity_id',i.id,'kind','invoice','action','insert','supplier_id',i.supplier_id,'supplier_name',s.name,'amount',i.amount,'invoice_no',i.invoice_no,'invoice_date',i.invoice_date,'created_at',i.created_at,'note',i.note,'status',i.status) as body
    from public.invoices i left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
    where i.store_id=p_store and i.created_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and i.created_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
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
    where a.store_id=p_store and a.created_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and a.created_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
      and (a.entity_type='invoice_history' or (a.entity_type in ('invoice','invoice_deletion') and a.action in ('confirmed_edited','revised','cancelled','deleted','draft_deleted','draft_updated')
        and not exists(select 1 from public.finance_audit_events h where h.store_id=p_store and h.entity_id=a.entity_id and h.entity_type='invoice_history' and h.created_at=a.created_at)))
    union all
    select 'reversal:'||p.id,p.reversed_at,p.reversed_by,
      jsonb_build_object('id','reversal:'||p.id,'entity_id',p.id,'kind','change','action','payment_reversed','supplier_id',p.supplier_id,'supplier_name',s.name,'amount',p.amount,'created_at',p.reversed_at,'note',p.reversal_reason)
    from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.store_id=p_store
    where p.store_id=p_store and p.status='reversed' and p.reversed_at >= p_from::timestamp at time zone 'Asia/Ulaanbaatar' and p.reversed_at < (p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'
    union all
    -- Actor-only rows enrich the existing payment statement without duplicating payments.
    select 'actor:'||p.id,p.created_at,p.created_by,
      jsonb_build_object('id',p.id,'kind','payment_actor','created_at',p.created_at)
    from public.payments p where p.store_id=p_store and p.payment_date between p_from and p_to
  )
  select e.body||jsonb_build_object('actor_name',pr.full_name)
  from events e left join public.profiles pr on pr.id=e.actor
  order by e.at desc nulls last,e.key desc;
end $$;
revoke all on function private.statement_activity(uuid,date,date) from public,anon;
grant execute on function private.statement_activity(uuid,date,date) to authenticated;
create or replace function public.statement_activity(p_store uuid,p_from date,p_to date)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select * from private.statement_activity(p_store,p_from,p_to);
$$;
revoke all on function public.statement_activity(uuid,date,date) from public,anon;
grant execute on function public.statement_activity(uuid,date,date) to authenticated;
