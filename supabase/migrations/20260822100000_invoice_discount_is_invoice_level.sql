-- A timely-payment discount is defined by the original invoice total.
-- It is not recalculated on the residual balance after a partial payment.

create or replace function public.post_supplier_payment_v11(
  p_payment_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_note text default null,
  p_reference text default null,
  p_allocations jsonb default '[]'::jsonb
)
returns table(payment_id uuid,remaining_balance numeric,discount_total numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_store_id uuid;
  v_existing public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_row record;
  v_outstanding numeric;
  v_remaining_cash numeric;
  v_cash numeric;
  v_debt numeric;
  v_discount numeric;
  v_discount_total numeric:=0;
  v_allocated numeric:=0;
  v_has_manual boolean:=false;
  v_prior_discount numeric:=0;
  v_discount_available numeric:=0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_payment_id is null then raise exception 'Payment id is required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'Allocations must be an array'; end if;

  select s.store_id into v_store_id from public.suppliers s where s.id=p_supplier_id for update;
  if v_store_id is null or not public.is_store_member(v_store_id) then raise exception 'Supplier is not available to this user'; end if;

  select * into v_existing from public.payments where id=p_payment_id;
  if found then
    if v_existing.store_id<>v_store_id or v_existing.supplier_id<>p_supplier_id or v_existing.amount<>p_amount or v_existing.payment_date<>coalesce(p_payment_date,current_date) or coalesce(v_existing.method,'')<>coalesce(nullif(btrim(p_method),''),'') or coalesce(v_existing.reference,'')<>coalesce(nullif(btrim(p_reference),''),'') then
      raise exception 'Payment id was already used with different details';
    end if;
    return query select p_payment_id,coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed'),0),coalesce((select sum(a.discount_amount) from public.payment_allocations a where a.payment_id=p_payment_id),0);
    return;
  end if;

  perform i.id from public.invoices i where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed' and i.paid<i.amount order by coalesce((select min(a.agreed_due_date) from public.invoice_agreements a where a.invoice_id=i.id and a.status='active'),i.due_date,i.invoice_date),i.created_at,i.id for update;
  select coalesce(sum(greatest(i.amount-i.paid,0)),0) into v_outstanding from public.invoices i where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed';
  if p_amount>v_outstanding then raise exception 'Payment exceeds outstanding balance'; end if;

  insert into public.payments(id,store_id,supplier_id,invoice_id,payment_date,amount,method,note,created_by,reference,status)
  values(p_payment_id,v_store_id,p_supplier_id,null,coalesce(p_payment_date,current_date),p_amount,nullif(btrim(p_method),''),nullif(btrim(p_note),''),(select auth.uid()),nullif(btrim(p_reference),''),'posted');

  v_has_manual:=jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))>0;
  v_remaining_cash:=p_amount;
  if v_has_manual then
    for v_row in select x.invoice_id,x.amount from jsonb_to_recordset(p_allocations) as x(invoice_id uuid,amount numeric)
    loop
      if v_row.amount is null or v_row.amount<=0 or v_row.amount>v_remaining_cash then raise exception 'Invalid payment allocation'; end if;
      select * into v_invoice from public.invoices where id=v_row.invoice_id for update;
      if not found or v_invoice.store_id<>v_store_id or v_invoice.supplier_id<>p_supplier_id or v_invoice.status<>'confirmed' then raise exception 'Allocated invoice is not available'; end if;
      select coalesce(sum(pa.discount_amount),0) into v_prior_discount from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where pa.invoice_id=v_invoice.id and p.status='posted';
      v_discount_available:=greatest(round(v_invoice.amount*v_invoice.discount_percent/100,2)-v_prior_discount,0);
      v_cash:=v_row.amount; v_debt:=v_cash;
      if coalesce(p_payment_date,current_date)<=v_invoice.discount_deadline and v_invoice.discount_percent>0 and v_cash=round(greatest((v_invoice.amount-v_invoice.paid)-v_discount_available,0),2) then
        v_debt:=v_invoice.amount-v_invoice.paid;
      end if;
      if v_debt>v_invoice.amount-v_invoice.paid then raise exception 'Allocation exceeds invoice balance'; end if;
      v_discount:=v_debt-v_cash;
      update public.invoices set paid=paid+v_debt,updated_at=now() where id=v_invoice.id;
      insert into public.payment_allocations(payment_id,invoice_id,cash_amount,debt_reduction,discount_amount) values(p_payment_id,v_invoice.id,v_cash,v_debt,v_discount);
      v_remaining_cash:=v_remaining_cash-v_cash; v_allocated:=v_allocated+v_cash; v_discount_total:=v_discount_total+v_discount;
    end loop;
  else
    for v_row in select i.* from public.invoices i where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed' and i.paid<i.amount order by coalesce((select min(a.agreed_due_date) from public.invoice_agreements a where a.invoice_id=i.id and a.status='active'),i.due_date,i.invoice_date),i.created_at,i.id
    loop
      exit when v_remaining_cash<=0;
      v_invoice:=v_row; v_debt:=v_invoice.amount-v_invoice.paid;
      select coalesce(sum(pa.discount_amount),0) into v_prior_discount from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where pa.invoice_id=v_invoice.id and p.status='posted';
      v_discount_available:=greatest(round(v_invoice.amount*v_invoice.discount_percent/100,2)-v_prior_discount,0);
      v_cash:=v_debt;
      if coalesce(p_payment_date,current_date)<=v_invoice.discount_deadline and v_invoice.discount_percent>0 then v_cash:=round(greatest(v_debt-v_discount_available,0),2); end if;
      if v_remaining_cash<v_cash then v_cash:=least(v_remaining_cash,v_debt); v_debt:=v_cash; end if;
      v_discount:=v_debt-v_cash;
      update public.invoices set paid=paid+v_debt,updated_at=now() where id=v_invoice.id;
      insert into public.payment_allocations(payment_id,invoice_id,cash_amount,debt_reduction,discount_amount) values(p_payment_id,v_invoice.id,v_cash,v_debt,v_discount);
      v_remaining_cash:=v_remaining_cash-v_cash; v_allocated:=v_allocated+v_cash; v_discount_total:=v_discount_total+v_discount;
    end loop;
  end if;
  if v_remaining_cash<>0 or v_allocated<>p_amount then raise exception 'Payment amount must be fully allocated'; end if;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details) values(v_store_id,'payment',p_payment_id,'posted',(select auth.uid()),jsonb_build_object('cash_amount',p_amount,'discount_amount',v_discount_total,'supplier_id',p_supplier_id));
  return query select p_payment_id,coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed'),0),v_discount_total;
end;
$$;

revoke execute on function public.post_supplier_payment_v11(uuid,uuid,numeric,date,text,text,text,jsonb) from public,anon;
grant execute on function public.post_supplier_payment_v11(uuid,uuid,numeric,date,text,text,text,jsonb) to authenticated;
