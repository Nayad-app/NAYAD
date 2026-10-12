-- Opt-in only; existing financial rows and legacy preferences are untouched.
create table public.push_reminder_settings (
 user_id uuid not null references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 enabled boolean not null default false,
 invoice_enabled boolean not null default true,
 discount_enabled boolean not null default true,
 agreement_enabled boolean not null default true,
 loan_enabled boolean not null default true,
 advance_days integer[] not null default '{1}',
 on_due_day boolean not null default true,
 overdue_days integer not null default 1 check(overdue_days in (0,1,3)),
 reminder_time time not null default '09:00:00',
 timezone text not null default 'Asia/Ulaanbaatar',
 enabled_at timestamptz not null default now(),
 primary key(user_id,store_id),
 check(advance_days <@ array[1,3,7] and cardinality(advance_days)<=3)
);
alter table public.push_reminder_settings enable row level security;
create policy own_push_settings on public.push_reminder_settings for all to authenticated
 using(user_id=(select auth.uid()) and public.is_store_member(store_id))
 with check(user_id=(select auth.uid()) and public.is_store_member(store_id));
grant select,insert,update,delete on public.push_reminder_settings to authenticated;
revoke all on public.push_reminder_settings from anon;
create function private.validate_push_settings() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid time zone'; end if;
 if new.reminder_time='24:00:00'::time then raise exception 'Invalid time'; end if;
 if TG_OP='INSERT' then new.enabled_at:=now();
 elsif new.enabled and not old.enabled then new.enabled_at:=now();
 else new.enabled_at:=old.enabled_at; end if;
 return new;
end $$;
create trigger validate_push_settings before insert or update on public.push_reminder_settings for each row execute function private.validate_push_settings();
create table public.web_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9.-]+\.push.apple.com)/'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}={0,2}$'),
 auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
 created_at timestamptz not null default now()
);
alter table public.web_push_subscriptions enable row level security;
create policy own_push_subscription on public.web_push_subscriptions for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.web_push_subscriptions to authenticated;
revoke all on public.web_push_subscriptions from anon;
create index web_push_subscriptions_user on public.web_push_subscriptions(user_id);
create table public.push_delivery_receipts (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 local_day date not null,
 attempts integer not null default 0,
 lease_until timestamptz,
 claim_token uuid,
 sent_at timestamptz,
 last_status integer,
 constraint push_delivery_once unique(subscription_id,store_id,local_day)
);
alter table public.push_delivery_receipts enable row level security;
revoke all on public.push_delivery_receipts from public,anon,authenticated;
grant all on public.push_delivery_receipts,public.push_reminder_settings,public.web_push_subscriptions to service_role;
create index push_receipts_store on public.push_delivery_receipts(store_id);

-- Keys live in encrypted Vault, never in public config or source control.
create function public.push_server_config() returns jsonb language sql security definer set search_path='' as $$
 select decrypted_secret::jsonb from vault.decrypted_secrets where name='nayad_web_push_config' limit 1
$$;
revoke all on function public.push_server_config() from public,anon,authenticated;
grant execute on function public.push_server_config() to service_role;
create function public.push_public_key() returns text language sql security definer set search_path='' as $$
 select (decrypted_secret::jsonb)->>'publicKey' from vault.decrypted_secrets
 where name='nayad_web_push_config' and (select auth.uid()) is not null limit 1
$$;
revoke all on function public.push_public_key() from public,anon;
grant execute on function public.push_public_key() to authenticated;

create function private.push_due_matches(p_due date,p_today date,p_advance integer[],p_today_on boolean,p_overdue integer)
returns boolean language sql immutable set search_path='' as $$
 select coalesce((p_due-p_today=any(p_advance)) or (p_due=p_today and p_today_on)
 or (p_due<p_today and p_overdue>0 and (p_today-p_due-1)%nullif(p_overdue,0)=0),false)
$$;

-- A service-only worker claims a bounded daily digest for each device/store.
-- Membership and module permissions are re-evaluated before each attempt.
create function public.claim_push_reminders() returns table(delivery_id uuid,claim_token uuid,subscription_id uuid,endpoint text,p256dh text,auth text,payload jsonb)
language plpgsql security invoker set search_path='' as $$
declare r record; v_day date; v_now timestamp; v_body text; v_id uuid; v_token uuid;
begin
 for r in select p.*,s.id as sid,s.endpoint as ep,s.p256dh as pk,s.auth as ak,m.role,m.permissions,st.name as store_name
 from public.push_reminder_settings p
 join public.stores st on st.id=p.store_id
 join public.store_members m on m.user_id=p.user_id and m.store_id=p.store_id
 join public.web_push_subscriptions s on s.user_id=p.user_id
 where p.enabled
 and (now() at time zone p.timezone)::time>=p.reminder_time
 and not exists(select 1 from public.push_delivery_receipts d where d.subscription_id=s.id and d.store_id=p.store_id
   and d.local_day=(now() at time zone p.timezone)::date
   and (d.sent_at is not null or d.attempts>=5 or d.lease_until>now()))
 order by p.user_id,p.store_id,s.id limit 100
 loop
 v_now:=now() at time zone r.timezone; v_day:=v_now::date;
 -- Do not send a retroactive reminder immediately after first opt-in.
 if (v_day+r.reminder_time) at time zone r.timezone < r.enabled_at then continue; end if;
 select string_agg(x.label||': '||x.n::text,' · ' order by x.label) into v_body from (
 select candidates.label,count(*) n from (
  select 'Падаан' as label from public.invoices i
  where r.invoice_enabled and (r.role='owner' or r.permissions->>'invoices' in ('view','edit'))
    and i.store_id=r.store_id and i.status='confirmed' and i.amount>i.paid
    and not exists(select 1 from public.invoice_agreements a where a.invoice_id=i.id and a.status='active')
    and private.push_due_matches(i.due_date,v_day,r.advance_days,r.on_due_day,r.overdue_days)
  union all
  select 'Хөнгөлөлт' from public.invoices i
  where r.discount_enabled and (r.role='owner' or r.permissions->>'invoices' in ('view','edit'))
    and i.store_id=r.store_id and i.status='confirmed' and i.amount>i.paid and i.discount_percent>0
    and private.push_due_matches(i.discount_deadline,v_day,r.advance_days,r.on_due_day,0)
  union all
  select 'Тохиролцоо' from public.invoices i
  where r.agreement_enabled and (r.role='owner' or r.permissions->>'invoices' in ('view','edit'))
    and i.store_id=r.store_id and i.status='confirmed' and i.amount>i.paid
    and private.push_due_matches((select min(a.agreed_due_date) from public.invoice_agreements a
      where a.invoice_id=i.id and a.status='active'),v_day,r.advance_days,r.on_due_day,r.overdue_days)
  union all
  select 'Зээл' from public.loan_installments li join public.loans l on l.id=li.loan_id
  where r.loan_enabled and (r.role='owner' or r.permissions->>'loans' in ('view','edit'))
    and li.store_id=r.store_id and l.store_id=r.store_id and l.status='active'
    and li.status<>'paid' and li.total_amount>li.paid_amount
    and private.push_due_matches(li.due_date,v_day,r.advance_days,r.on_due_day,r.overdue_days)
 ) candidates group by candidates.label
 ) x;
 if v_body is null then continue; end if;
 v_token:=gen_random_uuid();v_id:=null;
 insert into public.push_delivery_receipts as d(subscription_id,store_id,local_day,attempts,lease_until,claim_token)
 values(r.sid,r.store_id,v_day,1,now()+interval '5 minutes',v_token)
 on conflict on constraint push_delivery_once do update set attempts=d.attempts+1,lease_until=now()+interval '5 minutes',claim_token=v_token
 where d.sent_at is null and d.attempts<5 and (d.lease_until is null or d.lease_until<=now())
 returning d.id into v_id;
 if v_id is not null then return query select v_id,v_token,r.sid,r.ep,r.pk,r.ak,
   jsonb_build_object('title','NAYAD · '||left(r.store_name,70),'body',v_body,'tag','nayad-'||r.store_id::text||'-'||v_day::text,
     'url','/?reminders=1','store_id',r.store_id); end if;
 end loop;
end $$;
revoke all on function public.claim_push_reminders() from public,anon,authenticated;
grant execute on function public.claim_push_reminders() to service_role;

create function public.finish_push_reminder(p_id uuid,p_token uuid,p_status integer) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.push_delivery_receipts set sent_at=case when p_status between 200 and 299 then now() else null end,
 last_status=p_status,lease_until=now()+interval '5 minutes'
 where id=p_id and claim_token=p_token;
 if found and p_status in (404,410) then
 delete from public.web_push_subscriptions where id=(select subscription_id from public.push_delivery_receipts where id=p_id and claim_token=p_token);
 end if;
end $$;
revoke all on function public.finish_push_reminder(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.finish_push_reminder(uuid,uuid,integer) to service_role;
grant usage on schema private to service_role;
grant execute on function private.push_due_matches(date,date,integer[],boolean,integer) to service_role;
revoke all on function private.push_due_matches(date,date,integer[],boolean,integer) from public,anon,authenticated;
