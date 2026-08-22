create or replace function public.reverse_supplier_payment(p_payment_id uuid,p_reason text)
returns table(payment_id uuid,remaining_balance numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_payment public.payments%rowtype; v_role text; v_row record;
begin
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_payment.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then raise exception 'Only an owner or manager can reverse a payment'; end if;
  if v_payment.status<>'posted' then raise exception 'Payment is already reversed'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required'; end if;
  if not exists (select 1 from public.payment_allocations pa where pa.payment_id=p_payment_id) then
    raise exception 'Legacy payment cannot be reversed automatically';
  end if;
  for v_row in
    select pa.* from public.payment_allocations pa
    where pa.payment_id=p_payment_id
    order by pa.invoice_id
    for update
  loop
    update public.invoices set paid=greatest(paid-v_row.debt_reduction,0),updated_at=now()
    where id=v_row.invoice_id;
  end loop;
  update public.payments set status='reversed',reversed_at=now(),reversed_by=(select auth.uid()),
    reversal_reason=btrim(p_reason) where id=p_payment_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_payment.store_id,'payment',p_payment_id,'reversed',(select auth.uid()),
    jsonb_build_object('reason',btrim(p_reason)));
  return query select p_payment_id,
    coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i
      where i.store_id=v_payment.store_id and i.supplier_id=v_payment.supplier_id and i.status='confirmed'),0);
end;
$$;

revoke execute on function public.reverse_supplier_payment(uuid,text) from public,anon;
grant execute on function public.reverse_supplier_payment(uuid,text) to authenticated;
