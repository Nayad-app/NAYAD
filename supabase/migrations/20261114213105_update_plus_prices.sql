-- Update prices for new Plus orders only; existing orders and subscriptions
-- retain their purchased amount and period.
update public.subscription_plans
set amount = case code when 'month' then 19900 when 'year' then 199000 end,
    updated_at = now()
where code in ('month', 'year');
