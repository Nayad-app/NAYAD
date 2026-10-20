-- Public store QR accepts applications; applicant PII is private and owner-only.
create table private.staff_applications (
 id uuid primary key,store_id uuid not null references public.stores on delete cascade,
 form jsonb not null,images jsonb not null default '[]',status text not null default 'pending' check(status in ('pending','approved','rejected')),
 employee_id uuid references public.staff_employees,created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid,
 check(length(form::text)<=40000),check(length(images::text)<=5601000)
);
alter table private.staff_applications enable row level security;
revoke all on private.staff_applications from public,anon,authenticated;
create index staff_applications_store_created on private.staff_applications(store_id,created_at desc);
create unique index staff_applications_pending_phone on private.staff_applications(store_id,(form->>'phone')) where status='pending';
create function public.staff_applications(p_action text,p_store_token uuid default null,p_store_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;f jsonb:=p_data->'form';ims jsonb:=coalesce(p_data->'images','[]');im jsonb;k text;v text;aid uuid;r private.staff_applications;
begin
 if p_action in ('info','submit') then
  select store_id into sid from public.staff_store_settings where attendance_token=p_store_token;
  if sid is null then raise exception 'Дэлгүүрийн QR код олдсонгүй.';end if;
  if p_action='info' then return jsonb_build_object('name',(select name from public.stores where id=sid));end if;
  aid:=(p_data->>'id')::uuid;
  if aid is null then raise exception 'Хүсэлтийн дугаар шаардлагатай.';end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text,718));
  -- Retry returns only a generic acknowledgement, never applicant records.
  if exists(select 1 from private.staff_applications where id=aid and store_id=sid) then return '{"submitted":true}';end if;
  if jsonb_typeof(f) is distinct from 'object' or length(f::text)>40000 or (p_data->>'consent') is distinct from 'true' then raise exception 'Анкет, зөвшөөрлөө шалгана уу.';end if;
  foreach k in array array['job','surname','name','phone','available','emergency_name','emergency_relation','emergency_phone','experienced'] loop
   if length(trim(coalesce(f->>k,'')))=0 or length(f->>k)>250 then raise exception 'Заавал бөглөх талбараа шалгана уу.';end if;
  end loop;
  if f->>'phone' !~ '^[0-9]{8}$' or f->>'emergency_phone' !~ '^[0-9]{8}$' then raise exception 'Утасны дугаар 8 оронтой байна.';end if;
  if jsonb_typeof(f->'days') is distinct from 'array' then raise exception 'Ажиллах өдрөө сонгоно уу.';end if;
  if jsonb_array_length(f->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(f->'days') d where d not in ('Да','Мя','Лх','Пү','Ба','Бя','Ня')) then raise exception 'Ажиллах өдрөө зөв сонгоно уу.';end if;
  if f->>'experienced' not in ('Тийм','Үгүй') then raise exception 'Ажлын туршлагаа сонгоно уу.';end if;
  perform (f->>'available')::date;
  if exists(select 1 from private.staff_applications where store_id=sid and form->>'phone'=f->>'phone' and status='pending') then raise exception 'Энэ дугаараар илгээсэн анкет хүлээгдэж байна.';end if;
  if (select count(*) from private.staff_applications where store_id=sid and created_at>now()-interval '1 hour')>=50 then raise exception 'Түр хүлээгээд дахин оролдоно уу.';end if;
  if jsonb_typeof(ims)<>'array' or jsonb_array_length(ims)>4 then raise exception '4 хүртэл зураг хавсаргана.';end if;
  for im in select * from jsonb_array_elements(ims) loop
   k:=im->>'kind';v:=im->>'image';
   if k is null or k not in ('avatar','id_front','id_back','reference') or v is null or length(v)>1400000 or v !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' then raise exception 'Зургийн хэлбэр буруу байна.';end if;
   if substring(decode(split_part(v,',',2),'base64') from 1 for 3)<>decode('ffd8ff','hex') then raise exception 'JPEG зураг оруулна уу.';end if;
  end loop;
  insert into private.staff_applications(id,store_id,form,images) values(aid,sid,f,ims);return '{"submitted":true}';
 end if;
 if p_store_id is null or not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн анкет үзнэ.' using errcode='42501';end if;
 if p_action='list' then return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.form->>'name','phone',a.form->>'phone','job',a.form->>'job','status',a.status,'created_at',a.created_at) order by a.created_at desc) from private.staff_applications a where store_id=p_store_id),'[]');end if;
 select * into r from private.staff_applications where id=(p_data->>'id')::uuid and store_id=p_store_id for update;
 if not found then raise exception 'Анкет олдсонгүй.';end if;
 if p_action='get' then return to_jsonb(r);end if;
 if p_action='reject' then
  if r.status<>'pending' then raise exception 'Анкетын төлөв өөрчлөгдсөн.';end if;
  update private.staff_applications set status='rejected',reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;return '{}';
 end if;
 raise exception 'Үйлдэл буруу байна.';
end$$;
revoke all on function public.staff_applications(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_applications(text,uuid,uuid,jsonb) to anon,authenticated;

create function public.staff_save_employee_v5(p_store_id uuid,p_employee jsonb) returns public.staff_employees language plpgsql security definer set search_path='' as $$
declare r private.staff_applications;e public.staff_employees;aid uuid:=nullif(p_employee->>'application_id','')::uuid;im jsonb;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн батална.';end if;
 if aid is not null then
  select * into r from private.staff_applications where id=aid and store_id=p_store_id for update;
  if not found or r.status<>'pending' then raise exception 'Анкет олдсонгүй эсвэл төлөв өөрчлөгдсөн.';end if;
  if nullif(p_employee->>'id','') is not null or p_employee->>'phone' is distinct from r.form->>'phone' then raise exception 'Анкетын утасны дугаарыг өөрчлөхгүйгээр шинэ ажилтан бүртгэнэ.';end if;
 end if;
 e:=public.staff_save_employee_v4(p_store_id,p_employee);
 if aid is not null then
  for im in select * from jsonb_array_elements(r.images) loop
   if not exists(select 1 from private.staff_media where actor='e:'||e.id and store_id=p_store_id and kind=im->>'kind') then
    insert into private.staff_media(store_id,actor,kind,image) values(p_store_id,'e:'||e.id,im->>'kind',im->>'image');
   end if;
  end loop;
  update private.staff_applications set status='approved',employee_id=e.id,reviewed_at=now(),reviewed_by=auth.uid() where id=aid;
 end if;
 return e;
end$$;
revoke all on function public.staff_save_employee_v5(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_save_employee_v5(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
