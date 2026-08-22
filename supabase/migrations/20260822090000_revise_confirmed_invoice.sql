-- Correct a confirmed but completely unpaid invoice without losing the audit trail.
-- Once any payment is posted, the payment must be reversed before a correction.

create or replace function public.revise_confirmed_invoice(
  p_invoice_id uuid,
  p_invoice_no text,
  p_invoice_date date,
  p_due_date date,
  p_amount numeric,
  p_discount_percent numeric default 0,
  p_discount_deadline date default null,
  p_reason text default null
)
returns table(invoice_id uuid, invoice_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
  v_before jsonb;
  v_reason text:=nullif(btrim(p_reason),'');
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;

  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then
    raise exception 'Only an owner or manager can revise an invoice';
  end if;
  if v_invoice.status<>'confirmed' then
    raise exception 'Only a confirmed invoice can be revised';
  end if;
  if v_invoice.paid<>0 or exists (
    select 1
    from public.payment_allocations pa
    join public.payments p on p.id=pa.payment_id
    where pa.invoice_id=v_invoice.id and p.status='posted'
  ) then
    raise exception 'Reverse posted payment before revising this invoice';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'Invoice amount must be greater than zero'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required'; end if;
  if p_due_date is null then raise exception 'Payment due date is required'; end if;
  if p_due_date<p_invoice_date then raise exception 'Due date cannot be before invoice date'; end if;
  if coalesce(p_discount_percent,0)<0 or coalesce(p_discount_percent,0)>=100 then
    raise exception 'Discount percent must be between 0 and 100';
  end if;
  if coalesce(p_discount_percent,0)>0 and (
    p_discount_deadline is null or p_discount_deadline<p_invoice_date or p_discount_deadline>p_due_date
  ) then
    raise exception 'Discount deadline must be between invoice and due dates';
  end if;
  if v_reason is null then raise exception 'Correction reason is required'; end if;

  v_before:=jsonb_build_object(
    'invoice_no',v_invoice.invoice_no,'invoice_date',v_invoice.invoice_date,'due_date',v_invoice.due_date,
    'amount',v_invoice.amount,'discount_percent',v_invoice.discount_percent,'discount_deadline',v_invoice.discount_deadline
  );
  update public.invoices set
    invoice_no=nullif(btrim(p_invoice_no),''),
    invoice_date=p_invoice_date,
    due_date=p_due_date,
    amount=p_amount,
    discount_percent=coalesce(p_discount_percent,0),
    discount_deadline=case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end,
    correction_note=v_reason,
    updated_at=now()
  where id=p_invoice_id;

  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed_revised',(select auth.uid()),
    jsonb_build_object('reason',v_reason,'before',v_before,'after',jsonb_build_object(
      'invoice_no',nullif(btrim(p_invoice_no),''),'invoice_date',p_invoice_date,'due_date',p_due_date,
      'amount',p_amount,'discount_percent',coalesce(p_discount_percent,0),
      'discount_deadline',case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end
    )));
  return query select p_invoice_id,'confirmed'::text;
end;
$$;

revoke execute on function public.revise_confirmed_invoice(uuid,text,date,date,numeric,numeric,date,text) from public,anon;
grant execute on function public.revise_confirmed_invoice(uuid,text,date,date,numeric,numeric,date,text) to authenticated;
