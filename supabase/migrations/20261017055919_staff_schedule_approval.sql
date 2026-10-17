-- Additive change: existing attendance remains unapproved until an owner reviews it.
alter table public.staff_employees add column pay_days integer[] not null default '{}';
create table public.staff_schedule_history (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.staff_employees(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 effective_from date not null, start_time time not null, end_time time not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(start_time<>end_time)
);
create index staff_schedule_lookup on public.staff_schedule_history(employee_id,effective_from desc,created_at desc);
alter table public.staff_schedule_history enable row level security;
revoke all on public.staff_schedule_history from anon,authenticated;
grant select on public.staff_schedule_history to authenticated;
create policy "Schedule visible to managers" on public.staff_schedule_history for select to authenticated using(exists(select 1 from public.store_members m where m.store_id=staff_schedule_history.store_id and m.user_id=(select auth.uid()) and m.role in ('owner','manager')));
alter table public.staff_attendance
 add column approval_status text not null default 'pending' check(approval_status in ('pending','approved')),
 add column approved_by uuid references auth.users(id), add column approved_at timestamptz,
 add column original_clock_in timestamptz, add column original_clock_out timestamptz,
 add column approved_seconds integer, add column overtime_seconds integer not null default 0,
 add column wage_snapshot jsonb, add column schedule_snapshot jsonb;
create table public.staff_attendance_history (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
 attendance_id uuid not null references public.staff_attendance(id) on delete cascade,
 actor_id uuid references auth.users(id),changed_at timestamptz not null default now(), before_value jsonb,after_value jsonb not null
);
create index staff_history_attendance on public.staff_attendance_history(attendance_id,changed_at desc);
alter table public.staff_attendance_history enable row level security;
revoke all on public.staff_attendance_history from anon,authenticated;
grant select on public.staff_attendance_history to authenticated;
create policy "History visible to owners" on public.staff_attendance_history for select to authenticated using(exists(select 1 from public.store_members m where m.store_id=staff_attendance_history.store_id and m.user_id=(select auth.uid()) and m.role='owner'));
create function private.staff_owner(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.store_members where store_id=p_store and user_id=auth.uid() and role='owner')$$;
revoke all on function private.staff_owner(uuid) from public,anon,authenticated;
create function private.staff_schedule(p_employee uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('start',h.start_time,'end',h.end_time,'seconds',extract(epoch from h.end_time-h.start_time)+case when h.end_time<h.start_time then 86400 else 0 end) from public.staff_schedule_history h where h.employee_id=p_employee and h.effective_from<=p_date order by h.effective_from desc,h.created_at desc,h.id desc limit 1),(select jsonb_build_object('seconds',daily_hours*3600) from public.staff_employees where id=p_employee))
$$;
revoke all on function private.staff_schedule(uuid,date) from public,anon,authenticated;
create function private.staff_attendance_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.staff_attendance_history(store_id,attendance_id,actor_id,before_value,after_value) values(new.store_id,new.id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end$$;
revoke all on function private.staff_attendance_audit() from public,anon,authenticated;
create trigger staff_attendance_audit after insert or update on public.staff_attendance for each row execute function private.staff_attendance_audit();

create function public.staff_save_employee_v2(p_store_id uuid,p_employee jsonb) returns public.staff_employees language plpgsql security definer set search_path='' as $$
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
 update public.staff_employees set pay_days=d,updated_at=clock_timestamp() where id=e.id returning * into e;return e;
end$$;
revoke all on function public.staff_save_employee_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_save_employee_v2(uuid,jsonb) to authenticated;

create function public.staff_review_attendance(p_store_id uuid,p_employee_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_note text,p_overtime boolean,p_expected_updated_at timestamptz)
returns public.staff_attendance language plpgsql security definer set search_path='' as $$
declare e public.staff_employees;a public.staff_attendance;ci timestamptz;co timestamptz;s jsonb;w jsonb;total integer;extra integer;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн цаг батална.';end if;
 select * into e from public.staff_employees where id=p_employee_id and store_id=p_store_id for update;
 if not found then raise exception 'Ажилтан олдсонгүй.';end if;
 if p_work_date is null or p_clock_in is null or p_clock_out is null or p_clock_in=p_clock_out then raise exception 'Огноо, ирсэн болон гарсан цагийг зөв оруулна уу.';end if;
 ci:=(p_work_date+p_clock_in) at time zone 'Asia/Ulaanbaatar';
 co:=(p_work_date+p_clock_out+case when p_clock_out<p_clock_in then interval '1 day' else interval '0' end) at time zone 'Asia/Ulaanbaatar';
 if co>now() then raise exception 'Ирээдүйн цагийг батлах боломжгүй.';end if;
 select * into a from public.staff_attendance where employee_id=e.id and work_date=p_work_date for update;
 if a.updated_at is distinct from p_expected_updated_at then raise exception 'Цагийн бүртгэл өөрчлөгдсөн. Дахин нээгээд шалгана уу.';end if;
 s:=coalesce(a.schedule_snapshot,private.staff_schedule(e.id,p_work_date));
 w:=coalesce(a.wage_snapshot,jsonb_build_object('type',e.wage_type,'rate',e.hourly_rate,'monthly',e.monthly_salary,'multiplier',e.overtime_multiplier));
 total:=floor(extract(epoch from co-ci));extra:=greatest(0,total-(s->>'seconds')::numeric::integer);
 insert into public.staff_attendance(store_id,employee_id,work_date,clock_in,clock_out,original_clock_in,original_clock_out,edited_by,edit_note,approval_status,approved_by,approved_at,approved_seconds,overtime_seconds,schedule_snapshot,wage_snapshot)
 values(p_store_id,e.id,p_work_date,ci,co,a.clock_in,a.clock_out,auth.uid(),nullif(btrim(p_note),''),'approved',auth.uid(),clock_timestamp(),total-case when coalesce(p_overtime,false) then 0 else extra end,case when coalesce(p_overtime,false) then extra else 0 end,s,w)
 on conflict(employee_id,work_date) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,original_clock_in=coalesce(staff_attendance.original_clock_in,staff_attendance.clock_in),original_clock_out=coalesce(staff_attendance.original_clock_out,staff_attendance.clock_out),edited_by=auth.uid(),edit_note=excluded.edit_note,approval_status='approved',approved_by=auth.uid(),approved_at=clock_timestamp(),approved_seconds=excluded.approved_seconds,overtime_seconds=excluded.overtime_seconds,schedule_snapshot=excluded.schedule_snapshot,wage_snapshot=excluded.wage_snapshot,updated_at=clock_timestamp()
 returning * into a;return a;
end$$;
revoke all on function public.staff_review_attendance(uuid,uuid,date,time,time,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.staff_review_attendance(uuid,uuid,date,time,time,text,boolean,timestamptz) to authenticated;
-- Old installed clients must also enforce owner approval and preserve review history.
create or replace function public.staff_owner_set_attendance(p_store_id uuid,p_employee_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_note text default null)
returns public.staff_attendance language plpgsql security definer set search_path='' as $$declare v timestamptz;begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн цаг батална.';end if;
 select updated_at into v from public.staff_attendance where store_id=p_store_id and employee_id=p_employee_id and work_date=p_work_date;
 return public.staff_review_attendance(p_store_id,p_employee_id,p_work_date,p_clock_in,p_clock_out,p_note,false,v);
end$$;

create or replace function public.staff_employee_clock(p_store_token uuid,p_device_token text,p_action text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_employee uuid;v_store uuid;v_settings public.staff_store_settings;v_distance double precision;v_open public.staff_attendance;v_today date:=(now() at time zone 'Asia/Ulaanbaatar')::date;
begin
 select s.* into v_settings from public.staff_store_settings s where s.attendance_token=p_store_token;
 select e.id into v_employee from public.staff_employees e join private.staff_credentials c on c.employee_id=e.id where e.store_id=v_settings.store_id and e.active and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') limit 1;
 v_store:=v_settings.store_id;
 if v_employee is null then raise exception 'Энэ утсыг дахин баталгаажуулна уу.'; end if;
 if v_settings.latitude is null or v_settings.longitude is null then raise exception 'Дэлгүүрийн байршлыг эзэн тохируулаагүй байна.'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Байршлын мэдээлэл буруу байна.'; end if;
 if p_accuracy is null or p_accuracy<0 or p_accuracy>200 then raise exception 'Байршлын нарийвчлал хангалтгүй байна. GPS-ээ асаагаад дахин оролдоно уу.'; end if;
 v_distance:=private.staff_distance_m(v_settings.latitude,v_settings.longitude,p_lat,p_lng);
 if v_distance>v_settings.radius_m then raise exception 'Та дэлгүүрийн зөвшөөрсөн байршилд алга байна.'; end if;
 perform 1 from public.staff_employees where id=v_employee for update;
 select * into v_open from public.staff_attendance where employee_id=v_employee and clock_in is not null and clock_out is null and clock_in>now()-interval '24 hours' order by clock_in desc limit 1 for update;
 if p_action='in' then
   if v_open.id is not null then return private.staff_public_state(v_employee,v_store);end if;
   if exists(select 1 from public.staff_attendance where employee_id=v_employee and work_date=v_today and approval_status='approved') then raise exception 'Эзэн баталсан бүртгэлийг өөрчлөхгүй.';end if;
   insert into public.staff_attendance(store_id,employee_id,work_date,clock_in,original_clock_in,clock_in_lat,clock_in_lng,clock_in_distance_m,schedule_snapshot)
   values(v_store,v_employee,v_today,now(),now(),p_lat,p_lng,round(v_distance),private.staff_schedule(v_employee,v_today))
   on conflict(employee_id,work_date) do nothing;
 elsif p_action='out' then
   if v_open.id is null then raise exception 'Ирсэн бүртгэл олдсонгүй. Эзнээр цагаа нөхүүлнэ үү.';end if;
   update public.staff_attendance set clock_out=now(),original_clock_out=now(),clock_out_lat=p_lat,clock_out_lng=p_lng,clock_out_distance_m=round(v_distance),updated_at=clock_timestamp() where id=v_open.id and approval_status='pending';
   if not found then raise exception 'Эзэн баталсан бүртгэлийг өөрчлөхгүй.';end if;
 else raise exception 'Үйлдэл буруу байна.'; end if;
 return private.staff_public_state(v_employee,v_store);
end$$;

create or replace function private.staff_public_state(p_employee uuid,p_store uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('employee_id',e.id,'employee_name',e.name,'store_name',s.name,
 'work_date',coalesce(a.work_date,(now() at time zone 'Asia/Ulaanbaatar')::date),'clock_in',a.clock_in,'clock_out',a.clock_out,'approval_status',a.approval_status,
 'worked_seconds',case when a.clock_in is null then 0 else greatest(0,extract(epoch from coalesce(a.clock_out,now())-a.clock_in)::bigint) end,
 'month_seconds',coalesce((select sum(x.approved_seconds) from public.staff_attendance x where x.employee_id=e.id and x.approval_status='approved' and date_trunc('month',x.work_date::timestamp)=date_trunc('month',now() at time zone 'Asia/Ulaanbaatar')),0))
 from public.staff_employees e join public.stores s on s.id=e.store_id left join lateral (
 select x.* from public.staff_attendance x where x.employee_id=e.id and
 (x.work_date=(now() at time zone 'Asia/Ulaanbaatar')::date or (x.clock_out is null and x.clock_in>now()-interval '24 hours'))
 order by (x.clock_out is null) desc,x.clock_in desc limit 1
 ) a on true where e.id=p_employee and e.store_id=p_store and e.active
$$;
notify pgrst,'reload schema';
