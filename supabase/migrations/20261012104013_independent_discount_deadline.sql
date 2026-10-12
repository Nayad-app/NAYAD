-- Discount validity is independent of the invoice payment due date.
-- Preserve function signatures, privileges and existing payment/image safeguards.

create or replace function public.confirm_invoice(p_invoice_id uuid)
returns table(invoice_id uuid, invoice_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then raise exception 'Only an owner or manager can confirm an invoice'; end if;
  if v_invoice.status<>'draft' then raise exception 'Only a draft invoice can be confirmed'; end if;
  if v_invoice.amount<=0 then raise exception 'Invoice amount must be greater than zero'; end if;
  if v_invoice.due_date is null then raise exception 'Payment due date is required'; end if;
  if v_invoice.due_date<v_invoice.invoice_date then raise exception 'Due date cannot be before invoice date'; end if;
  if v_invoice.discount_percent>0 and (
    v_invoice.discount_deadline is null or
    v_invoice.discount_deadline<v_invoice.invoice_date
  ) then raise exception 'Хөнгөлөлтийн эцсийн өдрийг оруулна уу. Энэ өдөр падааны огнооноос өмнө байж болохгүй.'; end if;

  update public.invoices set status='confirmed',confirmed_at=now(),confirmed_by=(select auth.uid()),updated_at=now()
  where id=p_invoice_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed',(select auth.uid()),
    jsonb_build_object('amount',v_invoice.amount,'due_date',v_invoice.due_date));
  return query select p_invoice_id,'confirmed'::text;
end;
$$;

create or replace function public.confirm_invoice_with_note(
  p_invoice_id uuid,
  p_note text default null
)
returns table(invoice_id uuid, invoice_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
  v_note text:=nullif(btrim(p_note),'');
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(v_note,''))>1000 then raise exception 'Invoice note is too long'; end if;

  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then
    raise exception 'Only an owner or manager can confirm an invoice';
  end if;
  if v_invoice.status<>'draft' then raise exception 'Only a draft invoice can be confirmed'; end if;
  if v_invoice.amount<=0 then raise exception 'Invoice amount must be greater than zero'; end if;
  if v_invoice.due_date is null then raise exception 'Payment due date is required'; end if;
  if v_invoice.due_date<v_invoice.invoice_date then raise exception 'Due date cannot be before invoice date'; end if;
  if v_invoice.discount_percent>0 and (
    v_invoice.discount_deadline is null or
    v_invoice.discount_deadline<v_invoice.invoice_date
  ) then raise exception 'Хөнгөлөлтийн эцсийн өдрийг оруулна уу. Энэ өдөр падааны огнооноос өмнө байж болохгүй.'; end if;

  update public.invoices set
    status='confirmed',
    note=v_note,
    confirmed_at=now(),
    confirmed_by=(select auth.uid()),
    updated_at=now()
  where id=p_invoice_id;

  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed',(select auth.uid()),
    jsonb_build_object('amount',v_invoice.amount,'due_date',v_invoice.due_date,'note',v_note));
  return query select p_invoice_id,'confirmed'::text;
end;
$$;

CREATE OR REPLACE FUNCTION public.edit_confirmed_invoice(p_invoice_id uuid, p_invoice_no text, p_invoice_date date, p_due_date date, p_amount numeric, p_discount_percent numeric DEFAULT 0, p_discount_deadline date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(invoice_id uuid, invoice_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invoice public.invoices%rowtype;
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_note text:=nullif(btrim(p_note),'');
  v_image_prefix text;
  v_first_image_url text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then
    raise exception 'Only an owner or manager can edit an invoice';
  end if;
  if v_invoice.status<>'confirmed' then raise exception 'Only a confirmed invoice can be edited'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Invoice amount must be greater than zero'; end if;
  if p_amount<v_invoice.paid then raise exception 'Invoice amount cannot be less than the paid amount'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required'; end if;
  if p_due_date is null then raise exception 'Payment due date is required'; end if;
  if p_due_date<p_invoice_date then raise exception 'Due date cannot be before invoice date'; end if;
  if coalesce(p_discount_percent,0)<0 or coalesce(p_discount_percent,0)>=100 then
    raise exception 'Discount percent must be between 0 and 100';
  end if;
  if coalesce(p_discount_percent,0)>0 and (
    p_discount_deadline is null or p_discount_deadline<p_invoice_date
  ) then raise exception 'Хөнгөлөлтийн эцсийн өдрийг оруулна уу. Энэ өдөр падааны огнооноос өмнө байж болохгүй.'; end if;
  if char_length(coalesce(v_note,''))>1000 then raise exception 'Invoice note is too long'; end if;

  if p_images is not null then
    if jsonb_typeof(p_images)<>'array' then raise exception 'Invoice images must be an array'; end if;
    if jsonb_array_length(p_images)>20 then raise exception 'An invoice can contain at most 20 images'; end if;
    v_image_prefix:=v_invoice.store_id::text||'/'||v_invoice.supplier_id::text||'/'||v_invoice.id::text||'/';
    if exists (
      select 1
      from jsonb_array_elements(p_images) as image
      where nullif(btrim(image->>'image_url'),'') is null
         or nullif(btrim(image->>'image_path'),'') is null
         or left(image->>'image_path',char_length(v_image_prefix))<>v_image_prefix
    ) then raise exception 'Invoice image path is invalid'; end if;
  end if;

  v_before:=jsonb_build_object(
    'invoice_no',v_invoice.invoice_no,
    'invoice_date',v_invoice.invoice_date,
    'due_date',v_invoice.due_date,
    'amount',v_invoice.amount,
    'paid',v_invoice.paid,
    'discount_percent',v_invoice.discount_percent,
    'discount_deadline',v_invoice.discount_deadline,
    'note',v_invoice.note,
    'image_count',(select count(*) from public.invoice_images ii where ii.invoice_id=v_invoice.id::text)
  );

  if p_images is not null then
    delete from public.invoice_images as ii where ii.invoice_id=v_invoice.id::text;
    insert into public.invoice_images(id,invoice_id,image_url,image_path,page_number)
    select gen_random_uuid(),v_invoice.id::text,image->>'image_url',image->>'image_path',ordinality::integer
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality);
    select image->>'image_url' into v_first_image_url
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality)
    order by ordinality limit 1;
  else
    v_first_image_url:=v_invoice.image_url;
  end if;

  update public.invoices set
    invoice_no=nullif(btrim(p_invoice_no),''),
    invoice_date=p_invoice_date,
    due_date=p_due_date,
    amount=p_amount,
    discount_percent=coalesce(p_discount_percent,0),
    discount_deadline=case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end,
    note=v_note,
    image_url=v_first_image_url,
    updated_at=now()
  where id=p_invoice_id;

  v_after:=jsonb_build_object(
    'invoice_no',nullif(btrim(p_invoice_no),''),
    'invoice_date',p_invoice_date,
    'due_date',p_due_date,
    'amount',p_amount,
    'paid_preserved',v_invoice.paid,
    'discount_percent',coalesce(p_discount_percent,0),
    'discount_deadline',case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end,
    'note',v_note,
    'image_count',case when p_images is null then (v_before->>'image_count')::integer else jsonb_array_length(p_images) end
  );

  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed_edited',(select auth.uid()),
    jsonb_build_object('before',v_before,'after',v_after));
  return query select p_invoice_id,'confirmed'::text;
end;
$function$
;

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
    p_discount_deadline is null or p_discount_deadline<p_invoice_date
  ) then
    raise exception 'Хөнгөлөлтийн эцсийн өдрийг оруулна уу. Энэ өдөр падааны огнооноос өмнө байж болохгүй.';
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
