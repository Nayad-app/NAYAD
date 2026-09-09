create index if not exists qpay_orders_plan_code_idx
  on public.qpay_orders(plan_code);

create index if not exists store_subscriptions_plan_code_idx
  on public.store_subscriptions(plan_code);

create index if not exists store_subscriptions_last_order_id_idx
  on public.store_subscriptions(last_order_id)
  where last_order_id is not null;
