-- Employee self-service: drafts stay optional; submission locks employee edits.
create table private.staff_profiles (
 employee_id uuid primary key references public.staff_employees(id) on delete cascade,
 form jsonb not null default '{}', submitted_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check(jsonb_typeof(form)='object' and length(form::text)<=20000)
);
alter table private.staff_profiles enable row level security;
revoke all on private.staff_profiles from public,anon,authenticated;

create function private.staff_profile_data(p_employee uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(p.form,a.form,'{}'::jsonb)||jsonb_build_object('name',e.name,'phone',e.phone)
 from public.staff_employees e left join private.staff_profiles p on p.employee_id=e.id
 left join lateral(select form from private.staff_applications where employee_id=e.id and store_id=e.store_id and status='approved' order by reviewed_at desc limit 1) a on true
 where e.id=p_employee
$$;
revoke all on function private.staff_profile_data(uuid) from public,anon,authenticated;

create function private.staff_profile_missing(p_employee uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare f jsonb:=private.staff_profile_data(p_employee); result jsonb:='[]'; k text; sid uuid;
begin
 foreach k in array array['surname','name','phone','birth','register','registered_address','address','emergency_name','emergency_relation','emergency_phone'] loop
  if btrim(coalesce(f->>k,''))='' then result:=result||jsonb_build_array(k);end if;
 end loop;
 select store_id into sid from public.staff_employees where id=p_employee;
 if not exists(select 1 from private.staff_media where store_id=sid and actor='e:'||p_employee and kind='avatar') then result:=result||'"avatar"'::jsonb;end if;
 if not exists(select 1 from private.staff_media where store_id=sid and actor='e:'||p_employee and kind='reference') then
  foreach k in array array['id_front','id_back'] loop
   if not exists(select 1 from private.staff_media where store_id=sid and actor='e:'||p_employee and kind=k) then result:=result||jsonb_build_array(k);end if;
  end loop;
 end if;
 return result;
end$$;
revoke all on function private.staff_profile_missing(uuid) from public,anon,authenticated;

create function public.staff_portal(p_action text,p_data jsonb default '{}',p_store_id uuid default null,p_employee_id uuid default null,p_store_token uuid default null,p_device_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.staff_employees; pr private.staff_profiles; f jsonb; k text; v text; missing jsonb; admin boolean:=false; month_start date; rows jsonb; totals jsonb;
begin
 if p_store_token is not null then
  select x.* into e from public.staff_employees x join public.staff_store_settings s on s.store_id=x.store_id join private.staff_credentials c on c.employee_id=x.id
  where s.attendance_token=p_store_token and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') and x.active;
  if e.id is null then raise exception 'Дахин нэвтэрнэ үү.' using errcode='42501';end if;
  if p_employee_id is not null and p_employee_id<>e.id then raise exception 'Бусдын мэдээллийг харах эрхгүй.' using errcode='42501';end if;
 else
  admin:=coalesce(private.staff_owner(p_store_id),false);
  if not admin then raise exception 'Ажилтны мэдээлэлд хандах эрхгүй.' using errcode='42501';end if;
  if p_action='list' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'active',x.active,'submitted_at',p.submitted_at,'missing',private.staff_profile_missing(x.id)) order by x.name) from public.staff_employees x left join private.staff_profiles p on p.employee_id=x.id where x.store_id=p_store_id),'[]');
  end if;
  select * into e from public.staff_employees where id=p_employee_id and store_id=p_store_id;
  if e.id is null then raise exception 'Ажилтан олдсонгүй.';end if;
 end if;
 -- Serialize profile submission with bank, media and employee changes.
 perform 1 from public.staff_employees where id=e.id for update;
 if not admin and not exists(select 1 from public.staff_employees x join private.staff_credentials c on c.employee_id=x.id where x.id=e.id and x.active and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex')) then raise exception 'Дахин нэвтэрнэ үү.';end if;
 select * into pr from private.staff_profiles where employee_id=e.id;
 if p_action in ('save','submit') then
  if pr.submitted_at is not null and not admin then raise exception 'Баталгаажуулж илгээсэн мэдээллийг өөрчлөх боломжгүй. Дэлгүүрийн эзэнд хандана уу.';end if;
  if p_action='submit' and admin then raise exception 'Ажилтан өөрөө баталгаажуулж илгээнэ.';end if;
  if pr.updated_at is distinct from (p_data->>'updated_at')::timestamptz then raise exception 'Мэдээлэл өөрчлөгдсөн. Дахин нээнэ үү.';end if;
  f:=private.staff_profile_data(e.id);
  if jsonb_typeof(p_data->'form') is distinct from 'object' or length((p_data->'form')::text)>20000 then raise exception 'Мэдээллийн хэлбэр буруу.';end if;
  foreach k in array array['surname','birth','register','facebook','registered_address','address','emergency_name','emergency_relation','emergency_phone'] loop
   if (p_data->'form') ? k then
    if jsonb_typeof(p_data->'form'->k) is distinct from 'string' then raise exception 'Мэдээллийн хэлбэр буруу.';end if;
    v:=btrim(p_data->'form'->>k);
    if length(v)>1000 then raise exception 'Мэдээлэл хэт урт байна.';end if;
    f:=jsonb_set(f,array[k],to_jsonb(v));
   end if;
  end loop;
  if coalesce(f->>'birth','')<>'' then
   if (f->>'birth')::date>(now() at time zone 'Asia/Ulaanbaatar')::date or (f->>'birth')::date<date '1900-01-01' then raise exception 'Төрсөн огноогоо зөв оруулна уу.';end if;
  end if;
  if coalesce(f->>'emergency_phone','')<>'' and f->>'emergency_phone' !~ '^[0-9+ ()-]{8,25}$' then raise exception 'Холбоо барих утсаа зөв оруулна уу.';end if;
  insert into private.staff_profiles(employee_id,form) values(e.id,f) on conflict(employee_id) do update set form=excluded.form,updated_at=clock_timestamp();
  if p_action='submit' then
   missing:=private.staff_profile_missing(e.id);
   if jsonb_array_length(missing)>0 then raise exception 'Дутуу мэдээллээ нөхөж, бичиг баримтын зургаа оруулна уу.';end if;
   update private.staff_profiles set submitted_at=clock_timestamp(),updated_at=clock_timestamp() where employee_id=e.id;
  end if;
  select * into pr from private.staff_profiles where employee_id=e.id;
 elsif p_action='hours' then
  month_start:=coalesce(nullif(p_data->>'month','')::date,date_trunc('month',now() at time zone 'Asia/Ulaanbaatar')::date);
  month_start:=date_trunc('month',month_start)::date;
  select coalesce(jsonb_agg(jsonb_build_object('date',a.work_date,'clock_in',a.clock_in,'clock_out',a.clock_out,'status',a.approval_status,'seconds',coalesce(a.approved_seconds,0),'overtime',a.overtime_seconds,
   'wage_type',a.wage_snapshot->>'type','gross',case when a.approval_status='approved' and a.wage_snapshot->>'type'='hourly' then round(((a.approved_seconds-a.overtime_seconds)+a.overtime_seconds*coalesce((a.wage_snapshot->>'multiplier')::numeric,1))::numeric/3600*coalesce((a.wage_snapshot->>'rate')::numeric,0),2) else 0 end,
   'deduction',case when a.approval_status='approved' then coalesce((a.wage_snapshot->>'late_deduction')::numeric,0) else 0 end) order by a.work_date desc),'[]') into rows
   from public.staff_attendance a where a.employee_id=e.id and a.store_id=e.store_id and a.work_date>=month_start and a.work_date<month_start+interval '1 month' and a.clock_in is not null;
  select jsonb_build_object('days',count(*),'approved_days',count(*) filter(where r->>'status'='approved'),'pending_days',count(*) filter(where r->>'status'<>'approved'),'seconds',coalesce(sum((r->>'seconds')::bigint) filter(where r->>'status'='approved'),0),'gross',coalesce(sum((r->>'gross')::numeric),0),'deduction',coalesce(sum((r->>'deduction')::numeric),0)) into totals from jsonb_array_elements(rows) r;
  return jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'name',e.name,'wage_type',e.wage_type,'monthly_salary',e.monthly_salary,'rows',rows,'totals',totals,'quote',private.staff_salary_quote(e.id),
   'receipts',coalesce((select jsonb_agg(jsonb_build_object('start',p.period_start,'end',p.period_end,'amount',p.amount,'paid_at',p.paid_at) order by p.paid_at desc) from private.staff_payouts p where p.employee_id=e.id and p.store_id=e.store_id and p.paid_at>=month_start::timestamp at time zone 'Asia/Ulaanbaatar' and p.paid_at<(month_start+interval '1 month') at time zone 'Asia/Ulaanbaatar'),'[]'));
 elsif p_action<>'get' then raise exception 'Үйлдэл буруу.';end if;
 return jsonb_build_object('employee_id',e.id,'name',e.name,'active',e.active,'form',private.staff_profile_data(e.id),'submitted_at',pr.submitted_at,'updated_at',pr.updated_at,'missing',private.staff_profile_missing(e.id),'admin',admin,
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind)) from private.staff_media m where m.store_id=e.store_id and m.actor='e:'||e.id and m.kind<>'chat'),'[]'));
end$$;
revoke all on function public.staff_portal(text,jsonb,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_portal(text,jsonb,uuid,uuid,uuid,text) to anon,authenticated;

create or replace function public.staff_hub(p_action text,p_payload jsonb default '{}',p_store_id uuid default null,p_store_token uuid default null,p_device_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_store uuid; v_actor text; v_owner boolean:=false; v_employee uuid; v_peer text; v_id uuid;
 v_kind text; v_image text; v_body text; v_result jsonb; v_media private.staff_media; v_until timestamptz; v_now timestamptz:=clock_timestamp();
begin
 if p_store_token is not null then
   select s.store_id,e.id into v_store,v_employee from public.staff_store_settings s join public.staff_employees e on e.store_id=s.store_id and e.active join private.staff_credentials c on c.employee_id=e.id
   where s.attendance_token=p_store_token and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex');
   if v_employee is not null then v_actor:='e:'||v_employee; end if;
 elsif auth.uid() is not null and private.has_store_permission(p_store_id,'staff','edit') then
   v_store:=p_store_id;v_actor:='u:'||auth.uid();v_owner:=true;
 end if;
 if v_actor is null then raise exception 'Нэвтрэх эрхгүй. Дахин нэвтэрнэ үү.' using errcode='42501'; end if;
 if not v_owner and (p_action='remove_image' or (p_action='upload' and coalesce(p_payload->>'kind','')<>'chat')) then
  perform 1 from public.staff_employees where id=v_employee for update;
  if not exists(select 1 from public.staff_employees e join private.staff_credentials c on c.employee_id=e.id where e.id=v_employee and e.active and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex')) then raise exception 'Дахин нэвтэрнэ үү.';end if;
  if exists(select 1 from private.staff_profiles where employee_id=v_employee and submitted_at is not null) then raise exception 'Баталгаажуулж илгээсэн мэдээллийг өөрчлөх боломжгүй.';end if;
 end if;
 v_peer:=nullif(p_payload->>'peer','');
 if v_peer is not null and (v_peer=v_actor or not exists(select 1 from private.staff_participants(v_store) p where p.actor=v_peer)) then raise exception 'Харилцах ажилтан олдсонгүй.'; end if;
 if p_action='list' then
   select jsonb_build_object('actor',v_actor,'owner',v_owner,'participants',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('avatar_id',(select m.id from private.staff_media m where m.store_id=v_store and m.actor=p.actor and m.kind='avatar' order by m.created_at desc limit 1))) from private.staff_participants(v_store) p),'[]'::jsonb),
   'threads',coalesce((select jsonb_agg(jsonb_build_object('peer',t.peer,'unread',(select count(*) from private.staff_messages m where m.store_id=v_store and m.sender<>v_actor and ((t.peer is null and m.recipient is null) or (t.peer=m.sender and m.recipient=v_actor)) and m.created_at>coalesce((select r.read_at from private.staff_reads r where r.store_id=v_store and r.actor=v_actor and r.thread=coalesce(t.peer,'group')),'epoch'::timestamptz)),
   'last',(select jsonb_build_object('body',m.body,'image',m.media_id is not null,'created_at',m.created_at) from private.staff_messages m where m.store_id=v_store and ((t.peer is null and m.recipient is null) or (m.sender=v_actor and m.recipient=t.peer) or (m.sender=t.peer and m.recipient=v_actor)) order by m.created_at desc limit 1))) from (select null::text peer union all select p.actor from private.staff_participants(v_store) p where p.actor<>v_actor) t),'[]'::jsonb)) into v_result;
   return v_result;
 elsif p_action='messages' then
   v_until:=nullif(p_payload->>'before','')::timestamptz;
   select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at),'[]') into v_result from (
    select m.id,m.sender,m.body,m.media_id,m.created_at from private.staff_messages m where m.store_id=v_store
    and ((v_peer is null and m.recipient is null) or (m.sender=v_actor and m.recipient=v_peer) or (m.sender=v_peer and m.recipient=v_actor))
    and (v_until is null or m.created_at<v_until) order by m.created_at desc limit 50) q;
   if v_until is null then
    insert into private.staff_reads(store_id,actor,thread,read_at) values(v_store,v_actor,coalesce(v_peer,'group'),v_now)
    on conflict(store_id,actor,thread) do update set read_at=excluded.read_at;
   end if;
   return jsonb_build_object('messages',v_result);
 elsif p_action='send' then
   perform pg_advisory_xact_lock(hashtextextended(v_store::text||v_actor,0));
   v_id:=(p_payload->>'id')::uuid; v_body:=btrim(coalesce(p_payload->>'body',''));
   if v_id is null or length(v_body)>4000 then raise exception 'Мессеж хэт урт байна.'; end if;
   if exists(select 1 from private.staff_messages m where m.id=v_id and m.store_id=v_store and m.sender=v_actor) then return jsonb_build_object('id',v_id); end if;
   if (select count(*) from private.staff_messages m where m.store_id=v_store and m.sender=v_actor and m.created_at>now()-interval '1 minute')>=30 then raise exception 'Түр хүлээгээд дахин илгээнэ үү.'; end if;
   if nullif(p_payload->>'media_id','') is not null then
    select * into v_media from private.staff_media m where m.id=(p_payload->>'media_id')::uuid and m.store_id=v_store and m.actor=v_actor and m.kind='chat';
    if v_media.id is null or exists(select 1 from private.staff_messages m where m.media_id=v_media.id) then raise exception 'Зураг олдсонгүй.'; end if;
   end if;
   if v_body='' and v_media.id is null then raise exception 'Мессеж бичнэ үү.'; end if;
   insert into private.staff_messages(id,store_id,sender,recipient,body,media_id) values(v_id,v_store,v_actor,v_peer,v_body,v_media.id);
   return jsonb_build_object('id',v_id);
 elsif p_action='upload' then
   perform pg_advisory_xact_lock(hashtextextended(v_store::text||v_actor,0));
   v_kind:=p_payload->>'kind';v_image:=p_payload->>'image';
   if v_kind is null or v_kind not in ('avatar','id_front','id_back','reference','chat') or (v_owner and v_kind<>'chat') then raise exception 'Зургийн төрөл буруу байна.'; end if;
   if v_image is null or length(v_image)>1400000 or v_image !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' then raise exception 'Зураг JPEG хэлбэртэй, 1 MB хүртэл байна.'; end if;
   if substring(decode(split_part(v_image,',',2),'base64') from 1 for 3)<>decode('ffd8ff','hex') then raise exception 'Зургийг уншиж чадсангүй.'; end if;
   if (select count(*) from private.staff_media m where m.store_id=v_store and m.actor=v_actor and m.created_at>now()-interval '1 hour')>=30 then raise exception 'Зураг оруулах хязгаарт хүрлээ. Түр хүлээнэ үү.'; end if;
   if v_kind<>'chat' then delete from private.staff_media where store_id=v_store and actor=v_actor and kind=v_kind; end if;
   insert into private.staff_media(store_id,actor,kind,image) values(v_store,v_actor,v_kind,v_image) returning id into v_id;
   return jsonb_build_object('id',v_id);
 elsif p_action='profile' then
   v_peer:=coalesce(nullif(p_payload->>'employee',''),v_actor);
   if v_peer<>v_actor and not v_owner then raise exception 'Энэ мэдээллийг харах эрхгүй.' using errcode='42501'; end if;
   if not exists(select 1 from private.staff_participants(v_store) p where p.actor=v_peer) then raise exception 'Ажилтан олдсонгүй.'; end if;
   return jsonb_build_object('media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind)) from private.staff_media m where m.store_id=v_store and m.actor=v_peer and m.kind<>'chat'),'[]'::jsonb));
 elsif p_action='image' then
   select * into v_media from private.staff_media where id=(p_payload->>'id')::uuid and store_id=v_store;
   if v_media.id is null then raise exception 'Зураг олдсонгүй.'; end if;
   if v_media.kind='avatar' or v_media.actor=v_actor or (v_owner and v_media.kind in ('id_front','id_back','reference')) or
    (v_media.kind='chat' and exists(select 1 from private.staff_messages m where m.media_id=v_media.id and m.store_id=v_store and (m.recipient is null or m.sender=v_actor or m.recipient=v_actor))) then
    return jsonb_build_object('image',v_media.image);
   end if;
   raise exception 'Зураг үзэх эрхгүй.' using errcode='42501';
 elsif p_action='remove_image' then
   delete from private.staff_media where id=(p_payload->>'id')::uuid and store_id=v_store and actor=v_actor and kind<>'chat';return '{}'::jsonb;
 elsif p_action='deactivate' then
   if not v_owner then raise exception 'Зөвхөн дэлгүүрийн эзэн хандалт хаана.' using errcode='42501'; end if;
   update public.staff_employees set active=false,updated_at=now() where id=(p_payload->>'employee_id')::uuid and store_id=v_store;
   update private.staff_credentials set device_hash=null where employee_id=(p_payload->>'employee_id')::uuid and exists(select 1 from public.staff_employees e where e.id=employee_id and e.store_id=v_store);
   return '{}'::jsonb;
 end if;
 raise exception 'Үйлдэл буруу байна.';
end$$;

create or replace function public.staff_bank_details(p_action text,p_store_id uuid default null,p_employee_id uuid default null,p_data jsonb default '{}',p_store_token uuid default null,p_device_token text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if p_store_token is not null then
   if not exists(select 1 from public.staff_employees x join private.staff_credentials c on c.employee_id=x.id where x.id=emp.id and x.active and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex')) then raise exception 'Дахин нэвтэрнэ үү.';end if;
   if exists(select 1 from private.staff_profiles where employee_id=emp.id and submitted_at is not null) then raise exception 'Баталгаажуулж илгээсэн мэдээллийг өөрчлөх боломжгүй.';end if;
  end if;
  if b.updated_at is distinct from (p_data->>'updated_at')::timestamptz then raise exception 'Дансны мэдээлэл өөрчлөгдсөн. Дахин нээнэ үү.';end if;
  if length(coalesce(p_data->>'bank',''))>100 or length(coalesce(p_data->>'account',''))>34 or length(coalesce(p_data->>'holder',''))>150 then raise exception 'Дансны мэдээлэл хэт урт байна.';end if;
  insert into private.staff_bank(employee_id,store_id,bank,account,holder,updated_by) values(emp.id,emp.store_id,btrim(coalesce(p_data->>'bank','')),regexp_replace(upper(coalesce(p_data->>'account','')),'\s','','g'),btrim(coalesce(p_data->>'holder','')),actor)
  on conflict(employee_id) do update set bank=excluded.bank,account=excluded.account,holder=excluded.holder,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into b;
 elsif p_action<>'get' then raise exception 'Үйлдэл буруу.';end if;
 return coalesce(to_jsonb(b),'{}');
end$$;
revoke all on function public.staff_bank_details(text,uuid,uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_bank_details(text,uuid,uuid,jsonb,uuid,text) to anon,authenticated;


notify pgrst,'reload schema';
