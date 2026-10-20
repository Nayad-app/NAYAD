-- Bank details and immutable salary receipts are available only through scoped RPCs.
create table private.staff_bank (
 employee_id uuid primary key references public.staff_employees on delete cascade,
 store_id uuid not null references public.stores on delete cascade,
 bank text not null default '', account text not null default '', holder text not null default '',
 updated_by text not null, updated_at timestamptz not null default clock_timestamp()
);
create index staff_bank_store on private.staff_bank(store_id);
create table private.staff_payouts (
 id uuid primary key, employee_id uuid not null references public.staff_employees on delete cascade,
 store_id uuid not null references public.stores on delete cascade,
 period_start date not null, period_end date not null, amount numeric not null check(amount>=0),
 receipt jsonb not null, bank text not null, account text not null, holder text not null, reference text not null,
 paid_by uuid not null, paid_by_name text not null, paid_at timestamptz not null default clock_timestamp(),
 unique(employee_id,period_end),check(period_end>=period_start)
);
create index staff_payouts_store on private.staff_payouts(store_id);
alter table private.staff_bank enable row level security;
alter table private.staff_payouts enable row level security;
revoke all on private.staff_bank,private.staff_payouts from public,anon,authenticated;

create function public.staff_bank_details(p_action text,p_store_id uuid default null,p_employee_id uuid default null,p_data jsonb default '{}',p_store_token uuid default null,p_device_token text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare emp public.staff_employees; b private.staff_bank; actor text; target uuid;
begin
 if p_store_token is not null then
  select e.* into emp from public.staff_employees e join public.staff_store_settings s on s.store_id=e.store_id join private.staff_credentials c on c.employee_id=e.id where s.attendance_token=p_store_token and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') and e.active;
  if emp.id is null then raise exception 'Дахин нэвтэрнэ үү.';end if;
  actor:=emp.name;
 else
  if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн эзэн өөрчилнө.';end if;
  select * into emp from public.staff_employees where id=p_employee_id and store_id=p_store_id;
  select coalesce(nullif(full_name,''),'Эзэн') into actor from public.profiles where id=auth.uid();actor:=coalesce(actor,'Эзэн');
 end if;
 if emp.id is null then raise exception 'Ажилтан олдсонгүй.';end if;
 -- Same lock order as employee editing and attendance approval.
 perform 1 from public.staff_employees where id=emp.id for update;
 select * into b from private.staff_bank where employee_id=emp.id;
 if p_action='save' then
  if b.updated_at is distinct from (p_data->>'updated_at')::timestamptz then raise exception 'Дансны мэдээлэл өөрчлөгдсөн. Дахин нээнэ үү.';end if;
  if length(coalesce(p_data->>'bank',''))>100 or length(coalesce(p_data->>'account',''))>34 or length(coalesce(p_data->>'holder',''))>150 then raise exception 'Дансны мэдээлэл хэт урт байна.';end if;
  insert into private.staff_bank(employee_id,store_id,bank,account,holder,updated_by) values(emp.id,emp.store_id,btrim(coalesce(p_data->>'bank','')),regexp_replace(upper(coalesce(p_data->>'account','')),'\s','','g'),btrim(coalesce(p_data->>'holder','')),actor)
  on conflict(employee_id) do update set bank=excluded.bank,account=excluded.account,holder=excluded.holder,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into b;
 elsif p_action<>'get' then raise exception 'Үйлдэл буруу.';end if;
 return coalesce(to_jsonb(b),'{}');
end$$;
revoke all on function public.staff_bank_details(text,uuid,uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_bank_details(text,uuid,uuid,jsonb,uuid,text) to anon,authenticated;

create function public.staff_save_employee_v4(p_store_id uuid,p_employee jsonb) returns public.staff_employees language plpgsql security definer set search_path='' as $$
declare e public.staff_employees;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн эзэн өөрчилнө.';end if;
 e:=public.staff_save_employee_v3(p_store_id,p_employee);
 if p_employee ? 'bank_details' then perform public.staff_bank_details('save',p_store_id,e.id,p_employee->'bank_details');end if;
 return e;
end$$;
revoke all on function public.staff_save_employee_v4(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_save_employee_v4(uuid,jsonb) to authenticated;

create function private.staff_salary_quote(p_employee uuid) returns jsonb language plpgsql set search_path='' as $$
declare e public.staff_employees; last_end date; anchor date; cutoff date; startday date; prevday date; today date:=(now() at time zone 'Asia/Ulaanbaatar')::date; gross numeric; deduction numeric; secs bigint; pending bigint; row_count bigint; revisions text; installments integer; earliest date;
begin
 select * into e from public.staff_employees where id=p_employee;
 if coalesce(cardinality(e.pay_days),0)=0 then return jsonb_build_object('configured',false);end if;
 select max(period_end) into last_end from private.staff_payouts where employee_id=e.id;
 select min(work_date) into earliest from public.staff_attendance where employee_id=e.id;
 anchor:=coalesce(last_end+1,earliest,date_trunc('month',today)::date);
 -- Find the next scheduled payday; clamp short months and deduplicate 31 / month-end.
 select min(d) into cutoff from (select distinct (m+ (case when x=0 then extract(day from m+interval '1 month -1 day')::integer else least(x,extract(day from m+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date d from generate_series(date_trunc('month',anchor),date_trunc('month',anchor)+interval '2 months',interval '1 month') m cross join unnest(e.pay_days) x) days where d>=anchor;
 select max(d) into prevday from (select distinct (m+ (case when x=0 then extract(day from m+interval '1 month -1 day')::integer else least(x,extract(day from m+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date d from generate_series(date_trunc('month',cutoff)-interval '1 month',date_trunc('month',cutoff),interval '1 month') m cross join unnest(e.pay_days) x) days where d<cutoff;
 startday:=coalesce(last_end+1,prevday+1);
 select count(distinct case when x=0 then extract(day from date_trunc('month',cutoff)+interval '1 month -1 day')::integer else least(x,extract(day from date_trunc('month',cutoff)+interval '1 month -1 day')::integer) end) into installments from unnest(e.pay_days) x;
 select coalesce(sum(case when a.approval_status='approved' then a.approved_seconds else 0 end),0),count(*) filter(where a.approval_status<>'approved' or a.clock_out is null),count(*),
 coalesce(sum(case when a.approval_status='approved' and a.wage_snapshot->>'type'='hourly' then ((a.approved_seconds-coalesce(a.overtime_seconds,0))+coalesce(a.overtime_seconds,0)*coalesce((a.wage_snapshot->>'multiplier')::numeric,1))/3600*coalesce((a.wage_snapshot->>'rate')::numeric,0) else 0 end),0),
 coalesce(sum(case when a.approval_status='approved' then coalesce((a.wage_snapshot->>'late_deduction')::numeric,0) else 0 end),0),md5(coalesce(string_agg(a.id::text||a.updated_at::text,',' order by a.id),''))
 into secs,pending,row_count,gross,deduction,revisions from public.staff_attendance a where a.employee_id=e.id and a.work_date between startday and cutoff;
 if e.wage_type='monthly' then gross:=e.monthly_salary/greatest(installments,1);end if;
 return jsonb_build_object('configured',true,'start',startday,'end',cutoff,'seconds',secs,'pending',pending,'days',row_count,'gross',round(gross,2),'deduction',round(deduction,2),'amount',greatest(0,round(gross-deduction,2)),'wage_type',e.wage_type,'installments',installments,'revision',md5(revisions||e.updated_at::text));
end$$;
revoke all on function private.staff_salary_quote(uuid) from public,anon,authenticated;

create function public.staff_salary(p_store_id uuid,p_action text,p_employee_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.staff_employees;q jsonb; b private.staff_bank; r private.staff_payouts; who text; due date;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн эзэн цалин олгоно.';end if;
 if p_action='list' then
 return jsonb_build_object('employees',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'quote',private.staff_salary_quote(x.id),'last',(select to_jsonb(p) from private.staff_payouts p where p.employee_id=x.id order by period_end desc limit 1))) from public.staff_employees x where x.store_id=p_store_id and x.active),'[]'));
 end if;
 select * into e from public.staff_employees where id=p_employee_id and store_id=p_store_id for update;
 if e.id is null then raise exception 'Ажилтан олдсонгүй.';end if;
 if p_action='history' then return coalesce((select jsonb_agg(to_jsonb(p) order by p.period_end desc) from private.staff_payouts p where p.employee_id=e.id),'[]');end if;
 if p_action='confirm' then
 select * into r from private.staff_payouts where id=(p_data->>'id')::uuid and employee_id=e.id and store_id=p_store_id;
 if found then return to_jsonb(r);end if;
 end if;
 q:=private.staff_salary_quote(e.id);select * into b from private.staff_bank where employee_id=e.id;
 if p_action='preview' then return jsonb_build_object('quote',q,'bank',coalesce(to_jsonb(b),'{}'));end if;
 if p_action<>'confirm' then raise exception 'Үйлдэл буруу.';end if;
 if not (q->>'configured')::boolean then raise exception 'Цалин олгох өдрөө тохируулна уу.';end if;
 if q is distinct from p_data->'quote' then raise exception 'Цалингийн тооцоо өөрчлөгдсөн. Дахин нээж шалгана уу.';end if;
 due:=(q->>'end')::date;
 if due>(now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'Цалин олгох өдөр болоогүй байна.';end if;
 if (q->>'pending')::integer>0 then raise exception 'Хүлээгдэж буй цагийг эхлээд батална уу.';end if;
 if coalesce(b.holder,'')='' or b.updated_at is distinct from (p_data->>'bank_updated_at')::timestamptz then raise exception 'Дансны мэдээллийг дахин шалгана уу.';end if;
 if length(btrim(coalesce(p_data->>'bank',''))) not between 1 and 100 or length(regexp_replace(coalesce(p_data->>'account',''),'\s','','g')) not between 4 and 34 or length(btrim(coalesce(p_data->>'reference',''))) not between 1 and 300 then raise exception 'Банк, данс, гүйлгээний утгаа оруулна уу.';end if;
 select coalesce(nullif(full_name,''),'Эзэн') into who from public.profiles where id=auth.uid();
 insert into private.staff_payouts(id,employee_id,store_id,period_start,period_end,amount,receipt,bank,account,holder,reference,paid_by,paid_by_name)
 values((p_data->>'id')::uuid,e.id,p_store_id,(q->>'start')::date,due,(q->>'amount')::numeric,q,btrim(p_data->>'bank'),regexp_replace(upper(p_data->>'account'),'\s','','g'),b.holder,btrim(p_data->>'reference'),auth.uid(),coalesce(who,'Эзэн')) returning * into r;
 return to_jsonb(r);
end$$;
revoke all on function public.staff_salary(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_salary(uuid,text,uuid,jsonb) to authenticated;

create function private.staff_paid_time_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.staff_employees where id=new.employee_id for update;
 if exists(select 1 from private.staff_payouts p where p.employee_id=new.employee_id and new.work_date between p.period_start and p.period_end) or (tg_op='UPDATE' and exists(select 1 from private.staff_payouts p where p.employee_id=old.employee_id and old.work_date between p.period_start and p.period_end)) then raise exception 'Цалин олгосон хугацааны цагийг өөрчлөх боломжгүй.';end if;
 return new;
end$$;
revoke all on function private.staff_paid_time_guard() from public,anon,authenticated;
create trigger staff_paid_time_guard before insert or update on public.staff_attendance for each row execute function private.staff_paid_time_guard();
notify pgrst,'reload schema';
