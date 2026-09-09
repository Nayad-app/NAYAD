create table if not exists public.subscription_plans (
  code text primary key,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  duration_months integer not null check (duration_months > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans(code,title,amount,duration_months,is_active)
values
  ('month','1 сар',9900,1,true),
  ('year','1 жил',99000,12,true)
on conflict (code) do update set
  title=excluded.title,
  amount=excluded.amount,
  duration_months=excluded.duration_months,
  is_active=excluded.is_active,
  updated_at=now();

create table if not exists public.qpay_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code),
  duration_months integer not null check (duration_months > 0),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MNT' check (currency='MNT'),
  status text not null default 'creating' check (status in ('creating','pending','paid','failed','expired','cancelled')),
  sender_invoice_no text not null unique,
  qpay_invoice_id text unique,
  qpay_qr_text text,
  qpay_qr_image text,
  qpay_urls jsonb not null default '[]'::jsonb,
  qpay_short_url text,
  callback_token uuid not null default gen_random_uuid() unique,
  qpay_payment_id text,
  paid_amount numeric(14,2),
  paid_at timestamptz,
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qpay_orders_store_status_created_idx
  on public.qpay_orders(store_id,status,created_at desc);
create index if not exists qpay_orders_user_status_created_idx
  on public.qpay_orders(user_id,status,created_at desc);
create unique index if not exists qpay_orders_qpay_payment_id_unique_idx
  on public.qpay_orders(qpay_payment_id) where qpay_payment_id is not null;

create table if not exists public.store_subscriptions (
  store_id uuid primary key references public.stores(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  last_order_id uuid references public.qpay_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

alter table public.subscription_plans enable row level security;
alter table public.qpay_orders enable row level security;
alter table public.store_subscriptions enable row level security;

revoke all on public.subscription_plans from anon,authenticated;
revoke all on public.qpay_orders from anon,authenticated;
revoke all on public.store_subscriptions from anon,authenticated;
grant select on public.subscription_plans to authenticated;
grant select on public.qpay_orders to authenticated;
grant select on public.store_subscriptions to authenticated;
grant select,insert,update,delete on public.subscription_plans to service_role;
grant select,insert,update,delete on public.qpay_orders to service_role;
grant select,insert,update,delete on public.store_subscriptions to service_role;

drop policy if exists "Signed-in users can read active subscription plans" on public.subscription_plans;
create policy "Signed-in users can read active subscription plans"
on public.subscription_plans for select to authenticated using (is_active=true);

drop policy if exists "Owners can read their QPay orders" on public.qpay_orders;
create policy "Owners can read their QPay orders"
on public.qpay_orders for select to authenticated
using (
  user_id=(select auth.uid())
  and exists (
    select 1 from public.store_members sm
    where sm.store_id=qpay_orders.store_id
      and sm.user_id=(select auth.uid())
      and sm.role='owner'
  )
);

drop policy if exists "Members can read store subscription" on public.store_subscriptions;
create policy "Members can read store subscription"
on public.store_subscriptions for select to authenticated
using (
  exists (
    select 1 from public.store_members sm
    where sm.store_id=store_subscriptions.store_id
      and sm.user_id=(select auth.uid())
  )
);

create or replace function public.get_qpay_credentials_for_service()
returns table(client_name text,client_password text,invoice_code text)
language sql
security definer
set search_path=''
as $$
  select
    max(decrypted_secret) filter (where name='nayad_qpay_client_name'),
    max(decrypted_secret) filter (where name='nayad_qpay_client_password'),
    max(decrypted_secret) filter (where name='nayad_qpay_invoice_code')
  from vault.decrypted_secrets
  where name in ('nayad_qpay_client_name','nayad_qpay_client_password','nayad_qpay_invoice_code')
$$;
revoke all on function public.get_qpay_credentials_for_service() from public,anon,authenticated;
grant execute on function public.get_qpay_credentials_for_service() to service_role;

create or replace function public.finalize_qpay_order(
  p_order_id uuid,
  p_qpay_payment_id text,
  p_paid_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.qpay_orders%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_existing public.store_subscriptions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_order from public.qpay_orders where id=p_order_id for update;
  if not found then raise exception 'QPay order not found'; end if;

  if v_order.status='paid' then
    select * into v_existing from public.store_subscriptions where store_id=v_order.store_id;
    return jsonb_build_object(
      'paid',true,'store_id',v_order.store_id,'plan_code',v_existing.plan_code,
      'current_period_end',v_existing.current_period_end
    );
  end if;

  if v_order.status not in ('creating','pending') then raise exception 'QPay order is not payable'; end if;
  if p_paid_amount is null or p_paid_amount<v_order.amount then raise exception 'Paid amount is insufficient'; end if;

  select * into strict v_plan from public.subscription_plans where code=v_order.plan_code;
  select * into v_existing from public.store_subscriptions where store_id=v_order.store_id for update;

  v_start:=case
    when found and v_existing.status='active' and v_existing.current_period_end>now()
      then v_existing.current_period_end
    else now()
  end;
  v_end:=v_start+make_interval(months=>v_order.duration_months);

  update public.qpay_orders set
    status='paid',qpay_payment_id=nullif(btrim(p_qpay_payment_id),''),
    paid_amount=p_paid_amount,paid_at=coalesce(paid_at,now()),updated_at=now(),last_error=null
  where id=v_order.id;

  insert into public.store_subscriptions(
    store_id,plan_code,status,current_period_start,current_period_end,last_order_id,created_at,updated_at
  ) values (
    v_order.store_id,v_order.plan_code,'active',now(),v_end,v_order.id,now(),now()
  ) on conflict (store_id) do update set
    plan_code=excluded.plan_code,status='active',
    current_period_start=case
      when public.store_subscriptions.status='active' and public.store_subscriptions.current_period_end>now()
        then public.store_subscriptions.current_period_start
      else excluded.current_period_start
    end,
    current_period_end=excluded.current_period_end,
    last_order_id=excluded.last_order_id,updated_at=now();

  return jsonb_build_object(
    'paid',true,'store_id',v_order.store_id,'plan_code',v_order.plan_code,
    'current_period_end',v_end
  );
end
$$;
revoke all on function public.finalize_qpay_order(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.finalize_qpay_order(uuid,text,numeric) to service_role;
