create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff_employees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text not null check (phone ~ '^[0-9]{8}$'),
  wage_type text not null default 'monthly' check (wage_type in ('monthly','hourly')),
  monthly_salary numeric(14,2) check (monthly_salary is null or monthly_salary >= 0),
  hourly_rate numeric(14,2) check (hourly_rate is null or hourly_rate >= 0),
  daily_hours numeric(4,2) not null default 8 check (daily_hours > 0 and daily_hours <= 24),
  weekly_days integer not null default 6 check (weekly_days between 1 and 7),
  overtime_multiplier numeric(4,2) not null default 1.5 check (overtime_multiplier between 1 and 5),
  pay_period text not null default 'monthly' check (pay_period in ('weekly','monthly')),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,phone)
);

create table if not exists public.staff_store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  attendance_token uuid not null default gen_random_uuid() unique,
  latitude double precision,
  longitude double precision,
  radius_m integer not null default 150 check (radius_m between 30 and 1000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_in_distance_m integer,
  clock_out_distance_m integer,
  edited_by uuid references auth.users(id),
  edit_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id,work_date),
  check (clock_out is null or clock_in is not null),
  check (clock_out is null or clock_out >= clock_in)
);

create schema if not exists private;
create table if not exists private.staff_credentials (
  employee_id uuid primary key references public.staff_employees(id) on delete cascade,
  pin_hash text not null,
  device_hash text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.staff_employees enable row level security;
alter table public.staff_store_settings enable row level security;
alter table public.staff_attendance enable row level security;
revoke all on table public.staff_employees,public.staff_store_settings,public.staff_attendance from anon,authenticated;
grant select on table public.staff_employees,public.staff_store_settings,public.staff_attendance to authenticated;

create policy "Staff visible to store managers" on public.staff_employees for select to authenticated
using (exists(select 1 from public.store_members sm where sm.store_id=staff_employees.store_id and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')));
create policy "Staff settings visible to store managers" on public.staff_store_settings for select to authenticated
using (exists(select 1 from public.store_members sm where sm.store_id=staff_store_settings.store_id and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')));
create policy "Attendance visible to store managers" on public.staff_attendance for select to authenticated
using (exists(select 1 from public.store_members sm where sm.store_id=staff_attendance.store_id and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')));

create or replace function private.staff_manager(p_store uuid)
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.store_members sm where sm.store_id=p_store and sm.user_id=auth.uid() and sm.role in ('owner','manager'))$$;
revoke all on function private.staff_manager(uuid) from public,anon,authenticated;

create or replace function private.staff_distance_m(p_lat1 double precision,p_lng1 double precision,p_lat2 double precision,p_lng2 double precision)
returns double precision language sql immutable set search_path=''
as $$select 6371000 * 2 * asin(sqrt(power(sin(radians(p_lat2-p_lat1)/2),2)+cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians(p_lng2-p_lng1)/2),2)))$$;
revoke all on function private.staff_distance_m(double precision,double precision,double precision,double precision) from public,anon,authenticated;

create or replace function public.staff_save_employee(
 p_id uuid,p_store_id uuid,p_name text,p_phone text,p_pin text,p_wage_type text,
 p_monthly_salary numeric,p_hourly_rate numeric,p_daily_hours numeric,p_weekly_days integer,
 p_overtime_multiplier numeric,p_pay_period text)
returns public.staff_employees language plpgsql security definer set search_path=''
as $$
declare v_row public.staff_employees; v_phone text:=regexp_replace(coalesce(p_phone,''),'\D','','g');
begin
 if not private.staff_manager(p_store_id) then raise exception 'Ажилтан удирдах эрхгүй байна.'; end if;
 if coalesce(btrim(p_name),'')='' then raise exception 'Ажилтны нэрийг оруулна уу.'; end if;
 if char_length(v_phone)<>8 then raise exception 'Утасны дугаар 8 оронтой байна.'; end if;
 if p_id is null and coalesce(p_pin,'') !~ '^[0-9]{6}$' then raise exception 'PIN 6 оронтой байна.'; end if;
 if p_wage_type not in ('monthly','hourly') then raise exception 'Цалингийн төрөл буруу байна.'; end if;
 if p_wage_type='monthly' and coalesce(p_monthly_salary,-1)<0 then raise exception 'Сарын цалинг оруулна уу.'; end if;
 if p_wage_type='hourly' and coalesce(p_hourly_rate,-1)<0 then raise exception 'Цагийн цалинг оруулна уу.'; end if;
 if p_id is not null and not exists(select 1 from public.staff_employees e where e.id=p_id and e.store_id=p_store_id) then
   raise exception 'Ажилтан энэ дэлгүүрт олдсонгүй.';
 end if;
 insert into public.staff_employees(id,store_id,name,phone,wage_type,monthly_salary,hourly_rate,daily_hours,weekly_days,overtime_multiplier,pay_period,created_by)
 values(coalesce(p_id,gen_random_uuid()),p_store_id,btrim(p_name),v_phone,p_wage_type,case when p_wage_type='monthly' then p_monthly_salary end,case when p_wage_type='hourly' then p_hourly_rate end,coalesce(p_daily_hours,8),coalesce(p_weekly_days,6),coalesce(p_overtime_multiplier,1.5),coalesce(p_pay_period,'monthly'),auth.uid())
 on conflict(id) do update set name=excluded.name,phone=excluded.phone,wage_type=excluded.wage_type,monthly_salary=excluded.monthly_salary,hourly_rate=excluded.hourly_rate,daily_hours=excluded.daily_hours,weekly_days=excluded.weekly_days,overtime_multiplier=excluded.overtime_multiplier,pay_period=excluded.pay_period,updated_at=now()
 returning * into v_row;
 if p_id is null then
   insert into private.staff_credentials(employee_id,pin_hash) values(v_row.id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)));
 elsif coalesce(p_pin,'')<>'' then
   if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN 6 оронтой байна.'; end if;
   update private.staff_credentials set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),device_hash=null,failed_attempts=0,locked_until=null,updated_at=now() where employee_id=v_row.id;
 end if;
 return v_row;
end$$;

create or replace function public.staff_set_location(p_store_id uuid,p_lat double precision,p_lng double precision,p_radius_m integer default 150)
returns public.staff_store_settings language plpgsql security definer set search_path=''
as $$declare v_row public.staff_store_settings; begin
 if not private.staff_manager(p_store_id) then raise exception 'Байршил тохируулах эрхгүй байна.'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Байршил буруу байна.'; end if;
 if coalesce(p_radius_m,150) not between 30 and 1000 then raise exception 'Зөвшөөрөх зай 30–1000 метр байна.'; end if;
 insert into public.staff_store_settings(store_id,latitude,longitude,radius_m,updated_by) values(p_store_id,p_lat,p_lng,coalesce(p_radius_m,150),auth.uid())
 on conflict(store_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,radius_m=excluded.radius_m,updated_by=auth.uid(),updated_at=now()
 returning * into v_row; return v_row;
end$$;

create or replace function public.staff_ensure_settings(p_store_id uuid)
returns public.staff_store_settings language plpgsql security definer set search_path=''
as $$declare v_row public.staff_store_settings; begin
 if not private.staff_manager(p_store_id) then raise exception 'QR код харах эрхгүй байна.'; end if;
 insert into public.staff_store_settings(store_id,updated_by) values(p_store_id,auth.uid()) on conflict(store_id) do nothing;
 select * into v_row from public.staff_store_settings where store_id=p_store_id; return v_row;
end$$;

create or replace function public.staff_owner_set_attendance(p_store_id uuid,p_employee_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_note text default null)
returns public.staff_attendance language plpgsql security definer set search_path=''
as $$
declare v_row public.staff_attendance;v_in timestamptz;v_out timestamptz;
begin
 if not private.staff_manager(p_store_id) then raise exception 'Цагийн бүртгэл засах эрхгүй байна.'; end if;
 if not exists(select 1 from public.staff_employees e where e.id=p_employee_id and e.store_id=p_store_id) then raise exception 'Ажилтан олдсонгүй.'; end if;
 if p_clock_in is null then raise exception 'Ирсэн цагийг оруулна уу.'; end if;
 v_in:=(p_work_date::text||' '||p_clock_in::text)::timestamp at time zone 'Asia/Ulaanbaatar';
 if p_clock_out is not null then v_out:=(p_work_date::text||' '||p_clock_out::text)::timestamp at time zone 'Asia/Ulaanbaatar'; end if;
 if v_out is not null and v_out<v_in then raise exception 'Гарсан цаг ирсэн цагаас өмнө байж болохгүй.'; end if;
 insert into public.staff_attendance(store_id,employee_id,work_date,clock_in,clock_out,edited_by,edit_note)
 values(p_store_id,p_employee_id,p_work_date,v_in,v_out,auth.uid(),nullif(btrim(p_note),''))
 on conflict(employee_id,work_date) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,edited_by=auth.uid(),edit_note=excluded.edit_note,updated_at=now()
 returning * into v_row; return v_row;
end$$;

create or replace function private.staff_public_state(p_employee uuid,p_store uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'employee_id',e.id,'employee_name',e.name,'store_name',s.name,'work_date',(now() at time zone 'Asia/Ulaanbaatar')::date,
  'clock_in',a.clock_in,'clock_out',a.clock_out,
  'worked_seconds',case when a.clock_in is null then 0 else greatest(0,extract(epoch from coalesce(a.clock_out,now())-a.clock_in)::bigint) end,
  'month_seconds',coalesce((select sum(greatest(0,extract(epoch from coalesce(x.clock_out,case when x.work_date=(now() at time zone 'Asia/Ulaanbaatar')::date then now() else x.clock_in end)-x.clock_in)))::bigint from public.staff_attendance x where x.employee_id=e.id and date_trunc('month',x.work_date::timestamp)=date_trunc('month',(now() at time zone 'Asia/Ulaanbaatar'))),0)
 ) from public.staff_employees e join public.stores s on s.id=e.store_id left join public.staff_attendance a on a.employee_id=e.id and a.work_date=(now() at time zone 'Asia/Ulaanbaatar')::date where e.id=p_employee and e.store_id=p_store and e.active
$$;
revoke all on function private.staff_public_state(uuid,uuid) from public,anon,authenticated;

create or replace function public.staff_employee_sign_in(p_store_token uuid,p_phone text,p_pin text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_employee public.staff_employees; v_cred private.staff_credentials; v_store uuid; v_token text;
begin
 select store_id into v_store from public.staff_store_settings where attendance_token=p_store_token;
 select * into v_employee from public.staff_employees where store_id=v_store and phone=regexp_replace(coalesce(p_phone,''),'\D','','g') and active limit 1;
 if v_employee.id is null then return jsonb_build_object('error','Утасны дугаар эсвэл PIN буруу байна.'); end if;
 select * into v_cred from private.staff_credentials where employee_id=v_employee.id for update;
 if v_cred.locked_until>now() then return jsonb_build_object('error','Олон удаа буруу оролдсон. 15 минутын дараа дахин оролдоно уу.'); end if;
 if coalesce(p_pin,'') !~ '^[0-9]{6}$' or extensions.crypt(p_pin,v_cred.pin_hash)<>v_cred.pin_hash then
   update private.staff_credentials set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else null end,updated_at=now() where employee_id=v_employee.id;
   return jsonb_build_object('error','Утасны дугаар эсвэл PIN буруу байна.');
 end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 update private.staff_credentials set device_hash=encode(extensions.digest(v_token,'sha256'),'hex'),failed_attempts=0,locked_until=null,updated_at=now() where employee_id=v_employee.id;
 return private.staff_public_state(v_employee.id,v_store)||jsonb_build_object('device_token',v_token);
end$$;

create or replace function public.staff_employee_status(p_store_token uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$declare v_employee uuid;v_store uuid; begin
 select s.store_id,c.employee_id into v_store,v_employee from public.staff_store_settings s join public.staff_employees e on e.store_id=s.store_id and e.active join private.staff_credentials c on c.employee_id=e.id where s.attendance_token=p_store_token and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') limit 1;
 if v_employee is null then raise exception 'Энэ утсыг дахин баталгаажуулна уу.'; end if;
 return private.staff_public_state(v_employee,v_store);
end$$;

create or replace function public.staff_employee_clock(p_store_token uuid,p_device_token text,p_action text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_employee uuid;v_store uuid;v_settings public.staff_store_settings;v_distance double precision;v_today date:=(now() at time zone 'Asia/Ulaanbaatar')::date;
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
 if p_action='in' then
   insert into public.staff_attendance(store_id,employee_id,work_date,clock_in,clock_in_lat,clock_in_lng,clock_in_distance_m) values(v_store,v_employee,v_today,now(),p_lat,p_lng,round(v_distance))
   on conflict(employee_id,work_date) do update set clock_in=case when staff_attendance.clock_in is null then now() else staff_attendance.clock_in end,clock_in_lat=case when staff_attendance.clock_in is null then p_lat else staff_attendance.clock_in_lat end,clock_in_lng=case when staff_attendance.clock_in is null then p_lng else staff_attendance.clock_in_lng end,clock_in_distance_m=case when staff_attendance.clock_in is null then round(v_distance) else staff_attendance.clock_in_distance_m end,updated_at=now();
 elsif p_action='out' then
   update public.staff_attendance set clock_out=now(),clock_out_lat=p_lat,clock_out_lng=p_lng,clock_out_distance_m=round(v_distance),updated_at=now() where employee_id=v_employee and work_date=v_today and clock_in is not null and clock_out is null;
   if not found then raise exception 'Эхлээд “Ажилдаа ирлээ” дарна уу.'; end if;
 else raise exception 'Үйлдэл буруу байна.'; end if;
 return private.staff_public_state(v_employee,v_store);
end$$;

revoke all on function public.staff_save_employee(uuid,uuid,text,text,text,text,numeric,numeric,numeric,integer,numeric,text) from public,anon,authenticated;
revoke all on function public.staff_set_location(uuid,double precision,double precision,integer) from public,anon,authenticated;
revoke all on function public.staff_ensure_settings(uuid) from public,anon,authenticated;
revoke all on function public.staff_owner_set_attendance(uuid,uuid,date,time,time,text) from public,anon,authenticated;
grant execute on function public.staff_save_employee(uuid,uuid,text,text,text,text,numeric,numeric,numeric,integer,numeric,text) to authenticated;
grant execute on function public.staff_set_location(uuid,double precision,double precision,integer) to authenticated;
grant execute on function public.staff_ensure_settings(uuid) to authenticated;
grant execute on function public.staff_owner_set_attendance(uuid,uuid,date,time,time,text) to authenticated;

revoke all on function public.staff_employee_sign_in(uuid,text,text) from public,anon,authenticated;
revoke all on function public.staff_employee_status(uuid,text) from public,anon,authenticated;
revoke all on function public.staff_employee_clock(uuid,text,text,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.staff_employee_sign_in(uuid,text,text) to anon,authenticated;
grant execute on function public.staff_employee_status(uuid,text) to anon,authenticated;
grant execute on function public.staff_employee_clock(uuid,text,text,double precision,double precision,double precision) to anon,authenticated;

create index if not exists staff_employees_store_idx on public.staff_employees(store_id,active);
create index if not exists staff_attendance_store_date_idx on public.staff_attendance(store_id,work_date desc);
create index if not exists staff_attendance_employee_date_idx on public.staff_attendance(employee_id,work_date desc);
