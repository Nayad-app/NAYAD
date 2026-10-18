create index if not exists statement_invoice_insert_lookup on public.finance_audit_events(store_id,entity_id) where entity_type='invoice_history' and action='insert';
-- Lightweight statement pages. Audit records remain untouched.
-- Match the existing Mongolian/Latin search normalization.
create or replace function private.statement_search_text(value text)
returns text language sql immutable set search_path='' as $$
 select trim(replace(replace(coalesce(string_agg(case c
 when 'ё' then 'yo' when 'ц' then 'ts' when 'ч' then 'ch' when 'ш' then 'sh' when 'щ' then 'sh' when 'ю' then 'yu' when 'я' then 'ya' when 'ъ' then '' when 'ь' then ''
 else translate(c,'абвгдежзийклмноөпрстуүфхыэ','abvgdejziiklmnooprstuufhie'::text) end,'' order by n),''),'kh','h'),'zh','j'))
 from regexp_split_to_table(lower(normalize(coalesce(value,''),NFKC)),'') with ordinality as t(c,n);
$$;
create or replace function private.statement_entries(p_store uuid,p_id text default null)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'kind','payment','supplier_id',p.supplier_id,'supplier_name',s.name,'amount',p.amount,'payment_date',p.payment_date,'created_at',p.created_at,'created_by',p.created_by,'note',p.note,'reference',p.reference,'method',p.method,'invoice_id',p.invoice_id,'status',p.status)
 from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'payments','view')) and p.store_id=p_store and p.status='posted' and (p_id is null or p.id::text=p_id)
 union all
 select jsonb_build_object('id','invoice:'||i.id,'entity_id',i.id,'kind','invoice','supplier_id',i.supplier_id,'supplier_name',s.name,'amount',i.amount,'invoice_no',i.invoice_no,'invoice_date',i.invoice_date,'created_at',i.created_at,'created_by',i.created_by,'note',i.note,'status',i.status)
 from public.invoices i left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'invoices','view')) and i.store_id=p_store and (p_id is null or 'invoice:'||i.id=p_id)
 and not exists(select 1 from public.finance_audit_events a where a.store_id=p_store and a.entity_id=i.id and a.entity_type='invoice_history' and a.action='insert')
 union all
 select jsonb_build_object('id','audit:'||a.id,'entity_id',a.entity_id,'kind','invoice','supplier_id',coalesce(a.details->>'supplier_id',i.supplier_id::text),'supplier_name',coalesce(a.details->>'supplier_name',s.name),'amount',a.details#>'{after,amount}','invoice_no',coalesce(a.details#>>'{after,invoice_no}',i.invoice_no),'invoice_date',a.details#>>'{after,invoice_date}','created_at',a.created_at,'created_by',a.actor_id,'note',a.details#>>'{after,note}')
 from public.finance_audit_events a left join public.invoices i on i.id=a.entity_id and i.store_id=p_store left join public.suppliers s on s.id=i.supplier_id and s.store_id=p_store
 where (select auth.uid()) is not null and (select private.has_store_permission(p_store,'invoices','view')) and a.store_id=p_store and a.entity_type='invoice_history' and a.action='insert' and (p_id is null or 'audit:'||a.id=p_id);
$$;
create or replace function private.statement_page(p_store uuid,p_filters jsonb default '{}',p_offset integer default 0,p_asof timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; q text:=private.statement_search_text(p_filters->>'query'); cutoff timestamptz:=coalesce(p_asof,now());
begin
 if p_offset<0 then raise exception 'Invalid offset'; end if;
 with filtered as materialized (
 select e from private.statement_entries(p_store) e
 where (e->>'created_at')::timestamptz<=cutoff
 and (nullif(p_filters->>'from','') is null or coalesce(e->>'payment_date',((e->>'created_at')::timestamptz at time zone 'Asia/Ulaanbaatar')::date::text)>=(p_filters->>'from'))
 and (nullif(p_filters->>'to','') is null or coalesce(e->>'payment_date',((e->>'created_at')::timestamptz at time zone 'Asia/Ulaanbaatar')::date::text)<=(p_filters->>'to'))
 and (nullif(p_filters->>'supplier','') is null or e->>'supplier_id'=p_filters->>'supplier')
 and (nullif(p_filters->>'min','') is null or (e->>'amount')::numeric>=(p_filters->>'min')::numeric)
 and (nullif(p_filters->>'max','') is null or (e->>'amount')::numeric<=(p_filters->>'max')::numeric)
 and (q='' or strpos(private.statement_search_text(concat_ws(' ',e->>'supplier_name',e->>'note',e->>'reference',e->>'invoice_no')),q)>0
 or (e->>'kind'='payment' and exists(select 1 from public.payment_allocations a join public.invoices i on i.id=a.invoice_id and i.store_id=p_store where a.payment_id=(e->>'id')::uuid and strpos(private.statement_search_text(i.invoice_no),q)>0)))
 ), selected as materialized (
 select e from filtered where coalesce(p_filters->>'kind','all')='all' or e->>'kind'=p_filters->>'kind'
 ), page as (
 select e from selected order by (e->>'created_at')::timestamptz desc,e->>'id' desc offset p_offset limit 50
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(e-array['created_by','note','reference','method','invoice_id'] order by (e->>'created_at')::timestamptz desc,e->>'id' desc) from page),'[]'::jsonb),
 'totals',jsonb_build_object('payment',jsonb_build_object('count',(select count(*) from filtered where e->>'kind'='payment'),'amount',coalesce((select sum((e->>'amount')::numeric) from filtered where e->>'kind'='payment'),0)),
 'invoice',jsonb_build_object('count',(select count(*) from filtered where e->>'kind'='invoice'),'amount',coalesce((select sum((e->>'amount')::numeric) from filtered where e->>'kind'='invoice'),0))),
 'has_more',(select count(*)>p_offset+50 from selected),'asof',cutoff) into result;
 return result;
end $$;
create or replace function private.statement_detail(p_store uuid,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare entry jsonb; links jsonb;
begin
 select e into entry from private.statement_entries(p_store,p_id) e where e->>'id'=p_id;
 if entry is null then return null; end if;
 entry:=entry||jsonb_build_object('actor_name',(select full_name from public.profiles where id=(entry->>'created_by')::uuid));
 if entry->>'kind'='payment' then
 select coalesce(jsonb_agg(jsonb_build_object('invoice_id',a.invoice_id,'cash_amount',a.cash_amount,'discount_amount',a.discount_amount,'invoices',jsonb_build_object('invoice_no',i.invoice_no))),'[]'::jsonb) into links
 from public.payment_allocations a join public.invoices i on i.id=a.invoice_id and i.store_id=p_store where a.payment_id=p_id::uuid;
 if jsonb_array_length(links)=0 and entry->>'invoice_id' is not null then
 select jsonb_build_array(jsonb_build_object('invoice_id',i.id,'cash_amount',entry->'amount','discount_amount',0,'invoices',jsonb_build_object('invoice_no',i.invoice_no))) into links from public.invoices i where i.id=(entry->>'invoice_id')::uuid and i.store_id=p_store;
 end if;
 entry:=entry||jsonb_build_object('allocations',coalesce(links,'[]'::jsonb));
 end if;
 return entry-'created_by';
end $$;
revoke all on function private.statement_search_text(text),private.statement_entries(uuid,text),private.statement_page(uuid,jsonb,integer,timestamptz),private.statement_detail(uuid,text) from public,anon;
grant execute on function private.statement_page(uuid,jsonb,integer,timestamptz),private.statement_detail(uuid,text) to authenticated;
create or replace function public.statement_page(p_store uuid,p_filters jsonb default '{}',p_offset integer default 0,p_asof timestamptz default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.statement_page(p_store,p_filters,p_offset,p_asof); $$;
create or replace function public.statement_detail(p_store uuid,p_id text)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.statement_detail(p_store,p_id); $$;
revoke all on function public.statement_page(uuid,jsonb,integer,timestamptz),public.statement_detail(uuid,text) from public,anon;
grant execute on function public.statement_page(uuid,jsonb,integer,timestamptz),public.statement_detail(uuid,text) to authenticated;
