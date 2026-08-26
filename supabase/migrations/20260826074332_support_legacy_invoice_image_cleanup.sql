-- Keep a metadata-free deletion tombstone so legacy image paths can still be
-- removed by the same store's finance manager after the invoice row is gone.

create or replace function public.delete_invoice_with_history(p_invoice_id uuid)
returns table(
  invoice_id uuid,
  supplier_id uuid,
  store_id uuid,
  storage_paths text[],
  deleted_payment_count integer,
  adjusted_payment_count integer,
  remaining_balance numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
  v_paths text[]:=array[]::text[];
  v_payment_ids uuid[]:=array[]::uuid[];
  v_payment_id uuid;
  v_remaining_cash numeric;
  v_remaining_discount numeric;
  v_deleted_payment_count integer:=0;
  v_adjusted_payment_count integer:=0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id=p_invoice_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id=v_invoice.store_id
    and sm.user_id=(select auth.uid());
  if coalesce(v_role,'') not in ('owner','manager') then
    raise exception 'Only an owner or manager can delete an invoice';
  end if;

  select coalesce(array_agg(distinct ii.image_path order by ii.image_path),array[]::text[])
  into v_paths
  from public.invoice_images ii
  where ii.invoice_id=v_invoice.id::text
    and ii.image_path is not null;

  select coalesce(array_agg(source.payment_id order by source.payment_id),array[]::uuid[])
  into v_payment_ids
  from (
    select distinct pa.payment_id
    from public.payment_allocations pa
    where pa.invoice_id=v_invoice.id
    union
    select p.id
    from public.payments p
    where p.invoice_id=v_invoice.id
  ) source;

  perform p.id
  from public.payments p
  where p.id=any(v_payment_ids)
  order by p.id
  for update;

  delete from public.finance_audit_events fae
  where fae.entity_type='invoice'
    and fae.entity_id=v_invoice.id;
  delete from public.invoice_images ii where ii.invoice_id=v_invoice.id::text;
  delete from public.payment_allocations pa where pa.invoice_id=v_invoice.id;
  update public.payments p set invoice_id=null where p.invoice_id=v_invoice.id;

  foreach v_payment_id in array v_payment_ids loop
    if not exists (
      select 1 from public.payment_allocations pa where pa.payment_id=v_payment_id
    ) then
      delete from public.finance_audit_events fae
      where fae.entity_type='payment' and fae.entity_id=v_payment_id;
      delete from public.payments p where p.id=v_payment_id;
      if found then v_deleted_payment_count:=v_deleted_payment_count+1; end if;
    else
      select sum(pa.cash_amount),sum(pa.discount_amount)
      into v_remaining_cash,v_remaining_discount
      from public.payment_allocations pa
      where pa.payment_id=v_payment_id;

      update public.payments p
      set amount=v_remaining_cash,invoice_id=null
      where p.id=v_payment_id;
      if found then v_adjusted_payment_count:=v_adjusted_payment_count+1; end if;

      update public.finance_audit_events fae
      set details=jsonb_set(
        jsonb_set(fae.details,'{cash_amount}',to_jsonb(v_remaining_cash),true),
        '{discount_amount}',to_jsonb(coalesce(v_remaining_discount,0)),true
      )
      where fae.entity_type='payment'
        and fae.entity_id=v_payment_id
        and fae.action='posted';
    end if;
  end loop;

  delete from public.invoices i where i.id=v_invoice.id;

  insert into public.finance_audit_events(
    store_id,entity_type,entity_id,action,actor_id,details
  ) values (
    v_invoice.store_id,'invoice_deletion',v_invoice.id,'deleted',(select auth.uid()),
    jsonb_build_object(
      'deleted_payment_count',v_deleted_payment_count,
      'adjusted_payment_count',v_adjusted_payment_count
    )
  );

  return query select
    v_invoice.id,
    v_invoice.supplier_id,
    v_invoice.store_id,
    v_paths,
    v_deleted_payment_count,
    v_adjusted_payment_count,
    coalesce((
      select sum(greatest(i.amount-i.paid,0))
      from public.invoices i
      where i.store_id=v_invoice.store_id
        and i.supplier_id=v_invoice.supplier_id
        and i.status='confirmed'
    ),0);
end;
$$;

revoke execute on function public.delete_invoice_with_history(uuid) from public,anon;
grant execute on function public.delete_invoice_with_history(uuid) to authenticated;

drop policy if exists "Finance members can delete invoice image files" on storage.objects;
create policy "Finance members can delete invoice image files" on storage.objects
for delete to authenticated
using (
  bucket_id='invoice-images'
  and (
    exists (
      select 1
      from public.store_members sm
      where sm.store_id::text=(storage.foldername(name))[1]
        and sm.user_id=(select auth.uid())
        and sm.role in ('owner','manager')
    )
    or exists (
      select 1
      from public.finance_audit_events fae
      join public.store_members sm on sm.store_id=fae.store_id
      where fae.entity_type='invoice_deletion'
        and fae.action='deleted'
        and fae.entity_id::text=any(storage.foldername(name))
        and sm.user_id=(select auth.uid())
        and sm.role in ('owner','manager')
    )
  )
);
