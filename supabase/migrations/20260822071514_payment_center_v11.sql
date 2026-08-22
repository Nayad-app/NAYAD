-- NAYAD 1.1 payment center: draft/confirm invoices, immutable payment
-- allocations, negotiated due dates, and in-app due reminders.

alter table public.invoices
  add column if not exists status text not null default 'confirmed',
  add column if not exists due_date date,
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists discount_deadline date,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists correction_note text;

update public.invoices
set status = 'confirmed',
    confirmed_at = coalesce(confirmed_at, created_at)
where status is distinct from 'confirmed'
   or confirmed_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_status_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices add constraint invoices_status_check
      check (status in ('draft','confirmed','cancelled'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_amount_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices add constraint invoices_amount_check
      check (amount >= 0 and paid >= 0 and paid <= amount);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_discount_percent_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices add constraint invoices_discount_percent_check
      check (discount_percent >= 0 and discount_percent < 100);
  end if;
end $$;

alter table public.payments
  add column if not exists status text not null default 'posted',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists reference text,
  add column if not exists receipt_url text,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists reversal_reason text;

update public.payments set status='posted' where status is distinct from 'posted';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_status_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_status_check
      check (status in ('posted','reversed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_amount_positive_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_amount_positive_check
      check (amount > 0);
  end if;
end $$;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  cash_amount numeric(14,2) not null,
  debt_reduction numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint payment_allocations_cash_check check (cash_amount > 0),
  constraint payment_allocations_debt_check check (debt_reduction >= cash_amount),
  constraint payment_allocations_discount_check check (discount_amount = debt_reduction-cash_amount),
  constraint payment_allocations_payment_invoice_key unique (payment_id, invoice_id)
);

create table if not exists public.invoice_agreements (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  installment_no integer not null default 1,
  installment_count integer not null default 1,
  agreed_due_date date not null,
  agreed_amount numeric(14,2) not null,
  note text,
  contact_name text,
  contact_phone text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  constraint invoice_agreements_amount_check check (agreed_amount > 0),
  constraint invoice_agreements_installment_check check (
    installment_no > 0 and installment_count > 0 and installment_no <= installment_count
  ),
  constraint invoice_agreements_status_check check (status in ('active','replaced','cancelled'))
);

create unique index if not exists invoice_agreements_active_installment_key
  on public.invoice_agreements(invoice_id, installment_no)
  where status='active';

create table if not exists public.finance_audit_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  browser_enabled boolean not null default false,
  overdue_enabled boolean not null default true,
  due_today_enabled boolean not null default true,
  upcoming_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  updated_at timestamptz not null default now(),
  primary key (store_id,user_id)
);

create table if not exists public.due_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null,
  bucket text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  read_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  constraint due_notifications_kind_check check (kind in ('upcoming','due_today','overdue','draft_waiting')),
  constraint due_notifications_dedupe unique (user_id,invoice_id,bucket)
);

create index if not exists invoices_store_status_due_idx
  on public.invoices(store_id,status,due_date,created_at);
create index if not exists invoices_supplier_status_due_idx
  on public.invoices(supplier_id,status,due_date,created_at);
create index if not exists payment_allocations_payment_idx
  on public.payment_allocations(payment_id);
create index if not exists payment_allocations_invoice_idx
  on public.payment_allocations(invoice_id);
create index if not exists payments_store_status_date_idx
  on public.payments(store_id,status,payment_date desc,created_at desc);
create index if not exists invoice_agreements_store_due_idx
  on public.invoice_agreements(store_id,status,agreed_due_date);
create index if not exists finance_audit_store_created_idx
  on public.finance_audit_events(store_id,created_at desc);
create index if not exists due_notifications_user_unread_idx
  on public.due_notifications(user_id,created_at desc)
  where read_at is null;

alter table public.payment_allocations enable row level security;
alter table public.invoice_agreements enable row level security;
alter table public.finance_audit_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.due_notifications enable row level security;

drop policy if exists "Members can view payment allocations" on public.payment_allocations;
create policy "Members can view payment allocations" on public.payment_allocations
  for select to authenticated
  using (exists (
    select 1 from public.payments p
    where p.id=payment_allocations.payment_id and public.is_store_member(p.store_id)
  ));

drop policy if exists "Members can view invoice agreements" on public.invoice_agreements;
create policy "Members can view invoice agreements" on public.invoice_agreements
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "Members can view finance audit" on public.finance_audit_events;
create policy "Members can view finance audit" on public.finance_audit_events
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "Users can view notification preferences" on public.notification_preferences;
create policy "Users can view notification preferences" on public.notification_preferences
  for select to authenticated
  using (user_id=(select auth.uid()) and public.is_store_member(store_id));

drop policy if exists "Users can update notification preferences" on public.notification_preferences;
create policy "Users can update notification preferences" on public.notification_preferences
  for all to authenticated
  using (user_id=(select auth.uid()) and public.is_store_member(store_id))
  with check (user_id=(select auth.uid()) and public.is_store_member(store_id));

drop policy if exists "Users can view due notifications" on public.due_notifications;
create policy "Users can view due notifications" on public.due_notifications
  for select to authenticated
  using (user_id=(select auth.uid()) and public.is_store_member(store_id));

drop policy if exists "Users can update due notifications" on public.due_notifications;
create policy "Users can update due notifications" on public.due_notifications
  for update to authenticated
  using (user_id=(select auth.uid()) and public.is_store_member(store_id))
  with check (user_id=(select auth.uid()) and public.is_store_member(store_id));

create or replace function public.save_invoice_draft(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_no text,
  p_invoice_date date,
  p_due_date date,
  p_amount numeric,
  p_discount_percent numeric default 0,
  p_discount_deadline date default null,
  p_image_url text default null
)
returns table(invoice_id uuid, invoice_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_store_id uuid;
  v_existing public.invoices%rowtype;
  v_is_update boolean:=false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_invoice_id is null then raise exception 'Invoice id is required'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Invoice amount cannot be negative'; end if;
  if coalesce(p_discount_percent,0) < 0 or coalesce(p_discount_percent,0) >= 100 then
    raise exception 'Discount percent must be between 0 and 100';
  end if;

  select s.store_id into v_store_id from public.suppliers s where s.id=p_supplier_id;
  if v_store_id is null or not public.is_store_member(v_store_id) then
    raise exception 'Supplier is not available to this user';
  end if;

  select * into v_existing from public.invoices where id=p_invoice_id for update;
  if found then
    v_is_update:=true;
    if v_existing.store_id<>v_store_id or v_existing.supplier_id<>p_supplier_id then
      raise exception 'Invoice does not belong to this supplier';
    end if;
    if v_existing.status<>'draft' then raise exception 'Only a draft invoice can be edited'; end if;
    update public.invoices set
      invoice_no=nullif(btrim(p_invoice_no),''),
      invoice_date=coalesce(p_invoice_date,current_date),
      due_date=p_due_date,
      amount=p_amount,
      discount_percent=coalesce(p_discount_percent,0),
      discount_deadline=case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end,
      image_url=coalesce(p_image_url,image_url),
      updated_at=now()
    where id=p_invoice_id;
  else
    insert into public.invoices(
      id,store_id,supplier_id,invoice_no,invoice_date,due_date,amount,paid,
      status,discount_percent,discount_deadline,image_url,created_by
    ) values (
      p_invoice_id,v_store_id,p_supplier_id,nullif(btrim(p_invoice_no),''),
      coalesce(p_invoice_date,current_date),p_due_date,p_amount,0,'draft',
      coalesce(p_discount_percent,0),
      case when coalesce(p_discount_percent,0)>0 then p_discount_deadline else null end,
      p_image_url,(select auth.uid())
    );
  end if;

  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_store_id,'invoice',p_invoice_id,case when v_is_update then 'draft_updated' else 'draft_created' end,
    (select auth.uid()),jsonb_build_object('amount',p_amount,'due_date',p_due_date));
  return query select p_invoice_id,'draft'::text;
end;
$$;

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
    v_invoice.discount_deadline<v_invoice.invoice_date or
    v_invoice.discount_deadline>v_invoice.due_date
  ) then raise exception 'Discount deadline must be between invoice and due dates'; end if;

  update public.invoices set status='confirmed',confirmed_at=now(),confirmed_by=(select auth.uid()),updated_at=now()
  where id=p_invoice_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'confirmed',(select auth.uid()),
    jsonb_build_object('amount',v_invoice.amount,'due_date',v_invoice.due_date));
  return query select p_invoice_id,'confirmed'::text;
end;
$$;

create or replace function public.delete_invoice_draft(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then return false; end if;
  if not public.is_store_member(v_invoice.store_id) then raise exception 'Invoice is not available to this user'; end if;
  if v_invoice.status<>'draft' then raise exception 'Only a draft invoice can be deleted'; end if;
  delete from public.invoices where id=p_invoice_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'draft_deleted',(select auth.uid()),'{}'::jsonb);
  return true;
end;
$$;

create or replace function public.cancel_confirmed_invoice(p_invoice_id uuid,p_reason text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_invoice public.invoices%rowtype; v_role text;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select sm.role into v_role from public.store_members sm
    where sm.store_id=v_invoice.store_id and sm.user_id=(select auth.uid());
  if v_role not in ('owner','manager') then raise exception 'Only an owner or manager can cancel an invoice'; end if;
  if v_invoice.status<>'confirmed' then raise exception 'Only a confirmed invoice can be cancelled'; end if;
  if v_invoice.paid<>0 then raise exception 'A paid invoice must be corrected through payment reversal'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
  update public.invoices set status='cancelled',cancelled_at=now(),cancelled_by=(select auth.uid()),
    correction_note=btrim(p_reason),updated_at=now() where id=p_invoice_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_invoice.store_id,'invoice',p_invoice_id,'cancelled',(select auth.uid()),jsonb_build_object('reason',btrim(p_reason)));
  return true;
end;
$$;

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
  for v_row in select x.due_date,x.amount,x.n
    from jsonb_to_recordset(p_installments) with ordinality as x(due_date date,amount numeric,n bigint)
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
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_payment_id is null then raise exception 'Payment id is required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'Allocations must be an array'; end if;

  select s.store_id into v_store_id from public.suppliers s where s.id=p_supplier_id for update;
  if v_store_id is null or not public.is_store_member(v_store_id) then
    raise exception 'Supplier is not available to this user';
  end if;

  select * into v_existing from public.payments where id=p_payment_id;
  if found then
    if v_existing.store_id<>v_store_id or v_existing.supplier_id<>p_supplier_id or
       v_existing.amount<>p_amount or v_existing.payment_date<>coalesce(p_payment_date,current_date) or
       coalesce(v_existing.method,'')<>coalesce(nullif(btrim(p_method),''),'') or
       coalesce(v_existing.reference,'')<>coalesce(nullif(btrim(p_reference),''),'') then
      raise exception 'Payment id was already used with different details';
    end if;
    return query select p_payment_id,
      coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i
        where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed'),0),
      coalesce((select sum(a.discount_amount) from public.payment_allocations a where a.payment_id=p_payment_id),0);
    return;
  end if;

  perform i.id from public.invoices i
  where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed' and i.paid<i.amount
  order by coalesce((select min(a.agreed_due_date) from public.invoice_agreements a
    where a.invoice_id=i.id and a.status='active'),i.due_date,i.invoice_date),i.created_at,i.id
  for update;

  select coalesce(sum(greatest(i.amount-i.paid,0)),0) into v_outstanding
  from public.invoices i
  where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed';
  if p_amount>v_outstanding then raise exception 'Payment exceeds outstanding balance'; end if;

  insert into public.payments(
    id,store_id,supplier_id,invoice_id,payment_date,amount,method,note,created_by,reference,status
  ) values (
    p_payment_id,v_store_id,p_supplier_id,null,coalesce(p_payment_date,current_date),p_amount,
    nullif(btrim(p_method),''),nullif(btrim(p_note),''),(select auth.uid()),nullif(btrim(p_reference),''),'posted'
  );

  v_has_manual:=jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))>0;
  v_remaining_cash:=p_amount;
  if v_has_manual then
    for v_row in select x.invoice_id,x.amount from jsonb_to_recordset(p_allocations) as x(invoice_id uuid,amount numeric)
    loop
      if v_row.amount is null or v_row.amount<=0 or v_row.amount>v_remaining_cash then
        raise exception 'Invalid payment allocation';
      end if;
      select * into v_invoice from public.invoices where id=v_row.invoice_id for update;
      if not found or v_invoice.store_id<>v_store_id or v_invoice.supplier_id<>p_supplier_id or v_invoice.status<>'confirmed' then
        raise exception 'Allocated invoice is not available';
      end if;
      v_cash:=v_row.amount;
      v_debt:=v_cash;
      if coalesce(p_payment_date,current_date)<=v_invoice.discount_deadline and v_invoice.discount_percent>0 and
         v_cash=round((v_invoice.amount-v_invoice.paid)*(1-v_invoice.discount_percent/100),2) then
        v_debt:=v_invoice.amount-v_invoice.paid;
      end if;
      if v_debt>v_invoice.amount-v_invoice.paid then raise exception 'Allocation exceeds invoice balance'; end if;
      v_discount:=v_debt-v_cash;
      update public.invoices set paid=paid+v_debt,updated_at=now() where id=v_invoice.id;
      insert into public.payment_allocations(payment_id,invoice_id,cash_amount,debt_reduction,discount_amount)
      values(p_payment_id,v_invoice.id,v_cash,v_debt,v_discount);
      v_remaining_cash:=v_remaining_cash-v_cash;
      v_allocated:=v_allocated+v_cash;
      v_discount_total:=v_discount_total+v_discount;
    end loop;
  else
    for v_row in
      select i.* from public.invoices i
      where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed' and i.paid<i.amount
      order by coalesce((select min(a.agreed_due_date) from public.invoice_agreements a
        where a.invoice_id=i.id and a.status='active'),i.due_date,i.invoice_date),i.created_at,i.id
    loop
      exit when v_remaining_cash<=0;
      v_invoice:=v_row;
      v_debt:=v_invoice.amount-v_invoice.paid;
      v_cash:=v_debt;
      if coalesce(p_payment_date,current_date)<=v_invoice.discount_deadline and v_invoice.discount_percent>0 then
        v_cash:=round(v_debt*(1-v_invoice.discount_percent/100),2);
      end if;
      if v_remaining_cash<v_cash then v_cash:=least(v_remaining_cash,v_debt); v_debt:=v_cash; end if;
      v_discount:=v_debt-v_cash;
      update public.invoices set paid=paid+v_debt,updated_at=now() where id=v_invoice.id;
      insert into public.payment_allocations(payment_id,invoice_id,cash_amount,debt_reduction,discount_amount)
      values(p_payment_id,v_invoice.id,v_cash,v_debt,v_discount);
      v_remaining_cash:=v_remaining_cash-v_cash;
      v_allocated:=v_allocated+v_cash;
      v_discount_total:=v_discount_total+v_discount;
    end loop;
  end if;
  if v_remaining_cash<>0 or v_allocated<>p_amount then raise exception 'Payment amount must be fully allocated'; end if;

  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_store_id,'payment',p_payment_id,'posted',(select auth.uid()),
    jsonb_build_object('cash_amount',p_amount,'discount_amount',v_discount_total,'supplier_id',p_supplier_id));
  return query select p_payment_id,
    coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i
      where i.store_id=v_store_id and i.supplier_id=p_supplier_id and i.status='confirmed'),0),
    v_discount_total;
end;
$$;

create or replace function public.record_supplier_payment(
  p_payment_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_note text default null
)
returns table(payment_id uuid,remaining_balance numeric)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select r.payment_id,r.remaining_balance
  from public.post_supplier_payment_v11(
    p_payment_id,p_supplier_id,p_amount,p_payment_date,p_method,p_note,null,'[]'::jsonb
  ) r;
$$;

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
  for v_row in select pa.* from public.payment_allocations pa where pa.payment_id=p_payment_id order by pa.invoice_id for update
  loop
    update public.invoices set paid=greatest(paid-v_row.debt_reduction,0),updated_at=now() where id=v_row.invoice_id;
  end loop;
  update public.payments set status='reversed',reversed_at=now(),reversed_by=(select auth.uid()),
    reversal_reason=btrim(p_reason) where id=p_payment_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(v_payment.store_id,'payment',p_payment_id,'reversed',(select auth.uid()),jsonb_build_object('reason',btrim(p_reason)));
  return query select p_payment_id,
    coalesce((select sum(greatest(i.amount-i.paid,0)) from public.invoices i
      where i.store_id=v_payment.store_id and i.supplier_id=v_payment.supplier_id and i.status='confirmed'),0);
end;
$$;

create or replace function public.refresh_my_due_notifications(p_store_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_local_now timestamp:=now() at time zone 'Asia/Ulaanbaatar';
  v_today date:=(now() at time zone 'Asia/Ulaanbaatar')::date;
  v_inserted integer:=0;
  v_row record;
  v_kind text;
  v_slot text;
  v_bucket text;
  v_title text;
  v_body text;
begin
  if v_user_id is null or not public.is_store_member(p_store_id) then raise exception 'Store is not available to this user'; end if;
  insert into public.notification_preferences(store_id,user_id) values(p_store_id,v_user_id)
  on conflict(store_id,user_id) do nothing;
  for v_row in
    select i.id,i.invoice_no,i.amount-i.paid as balance,s.name as supplier_name,
      coalesce((select min(a.agreed_due_date) from public.invoice_agreements a
        where a.invoice_id=i.id and a.status='active'),i.due_date) as effective_due_date
    from public.invoices i join public.suppliers s on s.id=i.supplier_id
    where i.store_id=p_store_id and i.status='confirmed' and i.paid<i.amount and i.due_date is not null
  loop
    if v_row.effective_due_date is null then continue; end if;
    v_kind:=null;v_slot:=null;
    if v_row.effective_due_date<v_today then
      v_kind:='overdue';
      v_slot:=case when v_local_now::time>='17:30' then '1730' when v_local_now::time>='13:00' then '1300' when v_local_now::time>='09:00' then '0900' end;
    elsif v_row.effective_due_date=v_today then
      v_kind:='due_today';
      v_slot:=case when v_local_now::time>='17:30' then '1730' when v_local_now::time>='13:00' then '1300' when v_local_now::time>='09:00' then '0900' end;
    elsif v_row.effective_due_date-v_today in (1,2) then
      v_kind:='upcoming';
      v_slot:=case when v_local_now::time>='17:00' then '1700' when v_local_now::time>='09:00' then '0900' end;
    elsif v_row.effective_due_date-v_today in (3,5,7,14) and v_local_now::time>='09:00' then
      v_kind:='upcoming';v_slot:='0900';
    end if;
    if v_kind is null or v_slot is null then continue; end if;
    v_bucket:=v_kind||':'||v_today::text||':'||v_slot;
    v_title:=case v_kind when 'overdue' then 'Хугацаа хэтэрсэн төлбөр' when 'due_today' then 'Өнөөдөр төлөх падаан' else 'Төлөх хугацаа ойртлоо' end;
    v_body:=v_row.supplier_name||' · '||coalesce(v_row.invoice_no,'Дугааргүй')||' · '||trim(to_char(v_row.balance,'FM999G999G999G990D00'))||' ₮';
    insert into public.due_notifications(store_id,user_id,invoice_id,kind,bucket,title,body,payload)
    select p_store_id,v_user_id,v_row.id,v_kind,v_bucket,v_title,v_body,
      jsonb_build_object('invoice_id',v_row.id,'due_date',v_row.effective_due_date,'balance',v_row.balance)
    where case v_kind when 'overdue' then (select overdue_enabled from public.notification_preferences where store_id=p_store_id and user_id=v_user_id)
      when 'due_today' then (select due_today_enabled from public.notification_preferences where store_id=p_store_id and user_id=v_user_id)
      else (select upcoming_enabled from public.notification_preferences where store_id=p_store_id and user_id=v_user_id) end
    on conflict(user_id,invoice_id,bucket) do nothing;
    if found then v_inserted:=v_inserted+1; end if;
  end loop;
  return v_inserted;
end;
$$;

create or replace function public.mark_due_notification_read(p_notification_id uuid,p_snooze_minutes integer default null)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.due_notifications set
    read_at=case when p_snooze_minutes is null then now() else read_at end,
    snoozed_until=case when p_snooze_minutes is not null then now()+make_interval(mins=>greatest(p_snooze_minutes,1)) else snoozed_until end
  where id=p_notification_id and user_id=(select auth.uid());
  return found;
end;
$$;

revoke insert,update,delete,truncate on public.invoices from authenticated;
revoke insert,update,delete,truncate on public.payments from authenticated;
revoke all on public.payment_allocations,public.invoice_agreements,public.finance_audit_events,public.due_notifications from anon;
revoke insert,update,delete,truncate on public.payment_allocations,public.invoice_agreements,public.finance_audit_events,public.due_notifications from authenticated;
grant select on public.payment_allocations,public.invoice_agreements,public.finance_audit_events,public.due_notifications to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;

revoke execute on function public.save_invoice_draft(uuid,uuid,text,date,date,numeric,numeric,date,text) from public,anon;
revoke execute on function public.confirm_invoice(uuid) from public,anon;
revoke execute on function public.delete_invoice_draft(uuid) from public,anon;
revoke execute on function public.cancel_confirmed_invoice(uuid,text) from public,anon;
revoke execute on function public.set_invoice_agreement(uuid,jsonb,text,text,text) from public,anon;
revoke execute on function public.post_supplier_payment_v11(uuid,uuid,numeric,date,text,text,text,jsonb) from public,anon;
revoke execute on function public.record_supplier_payment(uuid,uuid,numeric,date,text,text) from public,anon;
revoke execute on function public.reverse_supplier_payment(uuid,text) from public,anon;
revoke execute on function public.refresh_my_due_notifications(uuid) from public,anon;
revoke execute on function public.mark_due_notification_read(uuid,integer) from public,anon;

grant execute on function public.save_invoice_draft(uuid,uuid,text,date,date,numeric,numeric,date,text) to authenticated;
grant execute on function public.confirm_invoice(uuid) to authenticated;
grant execute on function public.delete_invoice_draft(uuid) to authenticated;
grant execute on function public.cancel_confirmed_invoice(uuid,text) to authenticated;
grant execute on function public.set_invoice_agreement(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.post_supplier_payment_v11(uuid,uuid,numeric,date,text,text,text,jsonb) to authenticated;
grant execute on function public.record_supplier_payment(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.reverse_supplier_payment(uuid,text) to authenticated;
grant execute on function public.refresh_my_due_notifications(uuid) to authenticated;
grant execute on function public.mark_due_notification_read(uuid,integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.invoice_agreements; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.due_notifications; exception when duplicate_object then null; end;
  end if;
end $$;
