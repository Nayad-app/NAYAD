create or replace function public.set_invoice_agreement(
  p_invoice_id uuid,
  p_installments jsonb,
  p_note text default null,
  p_contact_name text default null,
  p_contact_phone text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
  v_count integer;
  v_sum numeric;
  v_row record;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found or v_invoice.status<>'confirmed' then raise exception 'Confirmed invoice not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then raise exception 'Only an owner or manager can set an agreement'; end if;
  if jsonb_typeof(p_installments)<>'array' or jsonb_array_length(p_installments)=0 then
    raise exception 'At least one installment is required';
  end if;
  select count(*),coalesce(sum(x.amount),0) into v_count,v_sum
  from jsonb_to_recordset(p_installments) as x(due_date date,amount numeric);
  if v_sum<=0 or v_sum>v_invoice.amount-v_invoice.paid then raise exception 'Agreed amount exceeds invoice balance'; end if;

  update public.invoice_agreements set status='replaced',replaced_at=now()
  where invoice_id=p_invoice_id and status='active';
  for v_row in
    select
      (x.installment->>'due_date')::date as due_date,
      (x.installment->>'amount')::numeric as amount,
      x.n
    from jsonb_array_elements(p_installments) with ordinality as x(installment,n)
  loop
    if v_row.due_date is null or v_row.amount is null or v_row.amount<=0 then
      raise exception 'Each installment needs a due date and positive amount';
    end if;
    insert into public.invoice_agreements(
      invoice_id,store_id,installment_no,installment_count,agreed_due_date,agreed_amount,
      note,contact_name,contact_phone,created_by
    ) values (
      p_invoice_id,v_invoice.store_id,v_row.n,v_count,v_row.due_date,v_row.amount,
      nullif(btrim(p_note),''),nullif(btrim(p_contact_name),''),nullif(btrim(p_contact_phone),''),(select auth.uid())
    );
  end loop;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'agreement_set',(select auth.uid()),
    jsonb_build_object('installments',p_installments,'note',p_note));
  return v_count;
end;
$$;
