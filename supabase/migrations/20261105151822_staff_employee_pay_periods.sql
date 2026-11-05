-- Separate employee-specific work periods from their payment dates. Existing schedules stay unchanged until configured.
alter table public.staff_employees add column pay_periods jsonb;

create function private.staff_period_valid(periods jsonb, days integer[]) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb; n integer; a integer; b integer; off integer; i integer:=0; coverage integer[]:=array_fill(0,array[31]);
begin
 if periods is null then return true;end if;
 if jsonb_typeof(periods)<>'array' or jsonb_array_length(periods)<>cardinality(days) or cardinality(days) not between 1 and 31 then return false;end if;
 for p in select value from jsonb_array_elements(periods) loop
  i:=i+1;
  if not (p ?& array['month_offset','start_day','end_day']) then return false;end if;
  if jsonb_typeof(p->'month_offset')<>'number' or jsonb_typeof(p->'start_day')<>'number' or jsonb_typeof(p->'end_day')<>'number' then return false;end if;
  off:=(p->>'month_offset')::integer;a:=(p->>'start_day')::integer;b:=(p->>'end_day')::integer;
  if off not in (-1,0) or a not between 1 and 28 or b not between 0 and 31 then return false;end if;
  if b=0 then b:=31;end if;
  if a>b or (off=0 and (case when days[i]=0 then 31 else days[i] end)<b) then return false;end if;
  for n in a..b loop coverage[n]:=coverage[n]+1;end loop;
 end loop;
 -- Every workday belongs to exactly one installment, including February.
 return not exists(select 1 from unnest(coverage) c where c<>1);
exception when others then return false;
end$$;
revoke all on function private.staff_period_valid(jsonb,integer[]) from public,anon,authenticated;
alter table public.staff_employees add constraint staff_pay_periods_valid check(private.staff_period_valid(pay_periods,pay_days));
create or replace function public.staff_save_employee_v2(p_store_id uuid,p_employee jsonb) returns public.staff_employees language plpgsql security definer set search_path='' as $$
declare e public.staff_employees; h public.staff_schedule_history; d integer[]; st time:=(p_employee->>'start_time')::time; en time:=(p_employee->>'end_time')::time; eff date:=(p_employee->>'effective_from')::date;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн өөрчилнө.';end if;
 if st is null or en is null or st=en or eff is null then raise exception 'Ажиллах цаг, мөрдөх огноог зөв оруулна уу.';end if;
 select array_agg(v::integer order by ord) into d from jsonb_array_elements_text(p_employee->'pay_days') with ordinality as t(v,ord);
 if coalesce(cardinality(d),0) not between 1 and 31 or exists(select 1 from unnest(d) x where x is null or x<0 or x>31) or (select count(distinct x) from unnest(d) x)<>cardinality(d) then raise exception 'Цалин олгох өдрүүд давхцахгүй, 1–31 эсвэл сарын сүүл байна.';end if;
 if nullif(p_employee->>'id','') is not null then
  select * into e from public.staff_employees where id=(p_employee->>'id')::uuid and store_id=p_store_id for update;
  if not found then raise exception 'Ажилтан олдсонгүй.';end if;
  if e.updated_at is distinct from (p_employee->>'updated_at')::timestamptz then raise exception 'Мэдээлэл өөрчлөгдсөн. Дахин нээгээд хадгална уу.';end if;
 end if;
 e:=public.staff_save_employee(nullif(p_employee->>'id','')::uuid,p_store_id,p_employee->>'name',p_employee->>'phone',p_employee->>'pin',p_employee->>'wage_type',(p_employee->>'monthly_salary')::numeric,(p_employee->>'hourly_rate')::numeric,(extract(epoch from en-st)+case when en<st then 86400 else 0 end)/3600,coalesce((p_employee->>'weekly_days')::integer,6),coalesce((p_employee->>'overtime_multiplier')::numeric,1.5),'monthly');
 select * into h from public.staff_schedule_history where employee_id=e.id order by effective_from desc,created_at desc,id desc limit 1;
 if h.id is null or h.start_time<>st or h.end_time<>en or h.effective_from<>eff then
  insert into public.staff_schedule_history(employee_id,store_id,effective_from,start_time,end_time,created_by) values(e.id,p_store_id,eff,st,en,auth.uid());
 end if;
 if p_employee ? 'pay_periods' and not private.staff_period_valid(p_employee->'pay_periods',d) then
 raise exception 'Тооцох хугацаа давхцахгүй, сарын бүх өдрийг хамарсан байна. Олгох өдөр хугацааны төгсгөлөөс өмнө байж болохгүй. Эхлэх өдөр 1–28 байна.';end if;
 if not (p_employee ? 'pay_periods') and e.pay_periods is not null and e.pay_days is distinct from d then raise exception 'Цалин тооцох хугацаатай хамт өдрөө шинэчилнэ үү. Хуудсаа дахин ачаална уу.';end if;
 update public.staff_employees set pay_periods=case when p_employee ? 'pay_periods' then p_employee->'pay_periods' else pay_periods end,pay_days=d,updated_at=clock_timestamp() where id=e.id returning * into e;return e;
end$$;
create or replace function private.staff_salary_quote(p_employee uuid) returns jsonb language plpgsql set search_path='' as $$
declare e public.staff_employees; last_end date; anchor date; cutoff date; startday date; prevday date; today date:=(now() at time zone 'Asia/Ulaanbaatar')::date; gross numeric; deduction numeric; secs bigint; pending bigint; row_count bigint; revisions text; installments integer; earliest date; payday date; full_start date; full_end date;
begin
 select * into e from public.staff_employees where id=p_employee;
 if coalesce(cardinality(e.pay_days),0)=0 then return jsonb_build_object('configured',false);end if;
 select max(period_end) into last_end from private.staff_payouts where employee_id=e.id;
 select min(work_date) into earliest from public.staff_attendance where employee_id=e.id;
 anchor:=coalesce(last_end+1,earliest,date_trunc('month',today)::date);
 if e.pay_periods is null then
 -- Find the next scheduled payday; clamp short months and deduplicate 31 / month-end.
 select min(d) into cutoff from (select distinct (m+ (case when x=0 then extract(day from m+interval '1 month -1 day')::integer else least(x,extract(day from m+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date d from generate_series(date_trunc('month',anchor),date_trunc('month',anchor)+interval '2 months',interval '1 month') m cross join unnest(e.pay_days) x) days where d>=anchor;
 select max(d) into prevday from (select distinct (m+ (case when x=0 then extract(day from m+interval '1 month -1 day')::integer else least(x,extract(day from m+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date d from generate_series(date_trunc('month',cutoff)-interval '1 month',date_trunc('month',cutoff),interval '1 month') m cross join unnest(e.pay_days) x) days where d<cutoff;
 startday:=coalesce(last_end+1,prevday+1);
 select count(distinct case when x=0 then extract(day from date_trunc('month',cutoff)+interval '1 month -1 day')::integer else least(x,extract(day from date_trunc('month',cutoff)+interval '1 month -1 day')::integer) end) into installments from unnest(e.pay_days) x;
 payday:=cutoff;
 else
 -- Build candidate paydays and their work windows near the earliest unpaid day.
 select r.s,r.t,r.d into full_start,full_end,payday from (
 select (w.work_month+((p.value->>'start_day')::integer-1)*interval '1 day')::date s,
 (w.work_month+(case when (p.value->>'end_day')::integer=0 then extract(day from w.work_month+interval '1 month -1 day')::integer else least((p.value->>'end_day')::integer,extract(day from w.work_month+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date t,
 (m+(case when e.pay_days[p.ord::integer]=0 then extract(day from m+interval '1 month -1 day')::integer else least(e.pay_days[p.ord::integer],extract(day from m+interval '1 month -1 day')::integer) end-1)*interval '1 day')::date d
 from generate_series(date_trunc('month',anchor),date_trunc('month',anchor)+interval '2 months',interval '1 month') m
 cross join jsonb_array_elements(e.pay_periods) with ordinality p(value,ord)
 cross join lateral (select m+(p.value->>'month_offset')::integer*interval '1 month' work_month) w
 ) r where r.t>=anchor order by r.t,r.d limit 1;
 cutoff:=full_end; startday:=greatest(full_start,coalesce(last_end+1,full_start));
 installments:=jsonb_array_length(e.pay_periods);
 end if;
 select coalesce(sum(case when a.approval_status='approved' then a.approved_seconds else 0 end),0),count(*) filter(where a.approval_status<>'approved' or a.clock_out is null),count(*),
 coalesce(sum(case when a.approval_status='approved' and a.wage_snapshot->>'type'='hourly' then ((a.approved_seconds-coalesce(a.overtime_seconds,0))+coalesce(a.overtime_seconds,0)*coalesce((a.wage_snapshot->>'multiplier')::numeric,1))/3600*coalesce((a.wage_snapshot->>'rate')::numeric,0) else 0 end),0),
 coalesce(sum(case when a.approval_status='approved' then coalesce((a.wage_snapshot->>'late_deduction')::numeric,0) else 0 end),0),md5(coalesce(string_agg(a.id::text||a.updated_at::text,',' order by a.id),''))
 into secs,pending,row_count,gross,deduction,revisions from public.staff_attendance a where a.employee_id=e.id and a.work_date between startday and cutoff;
 if e.wage_type='monthly' then gross:=e.monthly_salary/greatest(installments,1);if full_start is not null then gross:=gross*(cutoff-startday+1)::numeric/(full_end-full_start+1);end if;end if;
 return jsonb_build_object('configured',true,'start',startday,'end',cutoff,'pay_date',payday,'seconds',secs,'pending',pending,'days',row_count,'gross',round(gross,2),'deduction',round(deduction,2),'amount',greatest(0,round(gross-deduction,2)),'wage_type',e.wage_type,'installments',installments,'revision',md5(revisions||e.updated_at::text));
end$$;
create or replace function public.staff_salary(p_store_id uuid,p_action text,p_employee_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
 if (q->>'pay_date')::date>(now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'Цалин олгох өдөр болоогүй байна.';end if;
 if exists(select 1 from private.staff_payouts where employee_id=e.id and period_start<=due and period_end>=(q->>'start')::date) then raise exception 'Энэ хугацаанд цалин олгосон байна.';end if;
 if (q->>'pending')::integer>0 then raise exception 'Хүлээгдэж буй цагийг эхлээд батална уу.';end if;
 if coalesce(b.holder,'')='' or b.updated_at is distinct from (p_data->>'bank_updated_at')::timestamptz then raise exception 'Дансны мэдээллийг дахин шалгана уу.';end if;
 if length(btrim(coalesce(p_data->>'bank',''))) not between 1 and 100 or length(regexp_replace(coalesce(p_data->>'account',''),'\s','','g')) not between 4 and 34 or length(btrim(coalesce(p_data->>'reference',''))) not between 1 and 300 then raise exception 'Банк, данс, гүйлгээний утгаа оруулна уу.';end if;
 select coalesce(nullif(full_name,''),'Эзэн') into who from public.profiles where id=auth.uid();
 insert into private.staff_payouts(id,employee_id,store_id,period_start,period_end,amount,receipt,bank,account,holder,reference,paid_by,paid_by_name)
 values((p_data->>'id')::uuid,e.id,p_store_id,(q->>'start')::date,due,(q->>'amount')::numeric,q,btrim(p_data->>'bank'),regexp_replace(upper(p_data->>'account'),'\s','','g'),b.holder,btrim(p_data->>'reference'),auth.uid(),coalesce(who,'Эзэн')) returning * into r;
 return to_jsonb(r);
end$$;

notify pgrst,'reload schema';
