-- Run with execute_sql or psql. Fixtures use temporary tables only and are rolled back.
-- Reproduce the original SQL ambiguity, then verify the correction and optional images.
begin;
create temp table invoices(id uuid,store_id uuid,supplier_id uuid,invoice_no text,invoice_date date,due_date date,amount numeric,paid numeric,status text,discount_percent numeric,discount_deadline date,note text,image_url text,updated_at timestamptz);
create temp table store_members(store_id uuid,user_id uuid,role text);
create temp table invoice_images(id uuid,invoice_id text,image_url text,image_path text,page_number integer);
create temp table finance_audit_events(store_id uuid,entity_type text,entity_id uuid,action text,actor_id uuid,details jsonb);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into pg_temp.invoices values('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','TEST',current_date,current_date+30,1000,200,'confirmed',0,null,null,null,now());
insert into pg_temp.store_members values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','owner');
CREATE OR REPLACE FUNCTION pg_temp.edit_confirmed_invoice(p_invoice_id uuid, p_invoice_no text, p_invoice_date date, p_due_date date, p_amount numeric, p_discount_percent numeric DEFAULT 0, p_discount_deadline date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(invoice_id uuid, invoice_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invoice pg_temp.invoices%rowtype;
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_note text:=nullif(btrim(p_note),'');
  v_image_prefix text;
  v_first_image_url text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_invoice from pg_temp.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from pg_temp.store_members sm
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
    p_discount_deadline is null or p_discount_deadline<p_invoice_date or p_discount_deadline>p_due_date
  ) then raise exception 'Discount deadline must be between invoice and due dates'; end if;
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
    'image_count',(select count(*) from pg_temp.invoice_images ii where ii.invoice_id=v_invoice.id::text)
  );

  if p_images is not null then
    delete from pg_temp.invoice_images where invoice_id=v_invoice.id::text;
    insert into pg_temp.invoice_images(id,invoice_id,image_url,image_path,page_number)
    select gen_random_uuid(),v_invoice.id::text,image->>'image_url',image->>'image_path',ordinality::integer
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality);
    select image->>'image_url' into v_first_image_url
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality)
    order by ordinality limit 1;
  else
    v_first_image_url:=v_invoice.image_url;
  end if;

  update pg_temp.invoices set
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

  insert into pg_temp.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed_edited',(select auth.uid()),
    jsonb_build_object('before',v_before,'after',v_after));
  return query select p_invoice_id,'confirmed'::text;
end;
$function$
;
do $test$ begin
 begin
  perform * from pg_temp.edit_confirmed_invoice('22222222-2222-4222-8222-222222222222','TEST',current_date,current_date+30,1000,0,null,null,'[{"image_url":"https://example.test/page.jpg","image_path":"33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/22222222-2222-4222-8222-222222222222/page.jpg"}]'::jsonb);
  raise exception 'Expected ambiguous_column was not reproduced';
 exception when ambiguous_column then
  raise notice 'Original ambiguous_column reproduced';
 end;
end $test$;
CREATE OR REPLACE FUNCTION pg_temp.edit_confirmed_invoice(p_invoice_id uuid, p_invoice_no text, p_invoice_date date, p_due_date date, p_amount numeric, p_discount_percent numeric DEFAULT 0, p_discount_deadline date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_images jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(invoice_id uuid, invoice_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invoice pg_temp.invoices%rowtype;
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_note text:=nullif(btrim(p_note),'');
  v_image_prefix text;
  v_first_image_url text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_invoice from pg_temp.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from pg_temp.store_members sm
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
    p_discount_deadline is null or p_discount_deadline<p_invoice_date or p_discount_deadline>p_due_date
  ) then raise exception 'Discount deadline must be between invoice and due dates'; end if;
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
    'image_count',(select count(*) from pg_temp.invoice_images ii where ii.invoice_id=v_invoice.id::text)
  );

  if p_images is not null then
    delete from pg_temp.invoice_images as ii where ii.invoice_id=v_invoice.id::text;
    insert into pg_temp.invoice_images(id,invoice_id,image_url,image_path,page_number)
    select gen_random_uuid(),v_invoice.id::text,image->>'image_url',image->>'image_path',ordinality::integer
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality);
    select image->>'image_url' into v_first_image_url
    from jsonb_array_elements(p_images) with ordinality as images(image,ordinality)
    order by ordinality limit 1;
  else
    v_first_image_url:=v_invoice.image_url;
  end if;

  update pg_temp.invoices set
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

  insert into pg_temp.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed_edited',(select auth.uid()),
    jsonb_build_object('before',v_before,'after',v_after));
  return query select p_invoice_id,'confirmed'::text;
end;
$function$
;
select * from pg_temp.edit_confirmed_invoice('22222222-2222-4222-8222-222222222222','TEST',current_date,current_date+30,1000,0,null,null,'[{"image_url":"https://example.test/page.jpg","image_path":"33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/22222222-2222-4222-8222-222222222222/page.jpg"}]'::jsonb);
do $test$ begin
 if (select count(*) from pg_temp.invoice_images)<>1 then raise exception 'Image was not saved'; end if;
 if (select paid from pg_temp.invoices)<>200 then raise exception 'Paid amount changed'; end if;
end $test$;
select * from pg_temp.edit_confirmed_invoice('22222222-2222-4222-8222-222222222222','TEST',current_date,current_date+30,1000,0,null,null,null);
do $test$ begin
 if (select count(*) from pg_temp.invoice_images)<>1 then raise exception 'Optional photo removed existing image'; end if;
end $test$;
rollback;