-- Explicit opt-in staff administration; financial permissions and owner-only sharing stay unchanged.
create or replace function private.normalize_store_permissions(p_permissions jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_source jsonb := case when pg_catalog.jsonb_typeof(p_permissions) = 'object' then p_permissions else '{}'::jsonb end;
  v_customers text;
  v_invoices text;
  v_payments text;
  v_loans text;
begin
  v_customers := case when v_source ->> 'customers' in ('none','view','edit') then v_source ->> 'customers' else 'none' end;
  v_invoices := case when v_source ->> 'invoices' in ('none','view','edit') then v_source ->> 'invoices' else 'none' end;
  v_payments := case when v_source ->> 'payments' in ('none','view','edit') then v_source ->> 'payments' else 'none' end;
  v_loans := case when v_source ->> 'loans' in ('none','view','edit') then v_source ->> 'loans' else 'none' end;

  -- Recording a payment allocates it to one or more invoices. Payment editors
  -- therefore need to see the invoices they are allocating against.
  if v_payments = 'edit' and v_invoices = 'none' then
    v_invoices := 'view';
  end if;

  -- Invoice and payment rows refer to a customer. Keep customer names visible
  -- whenever either dependent module is visible.
  if v_customers = 'none' and (v_invoices <> 'none' or v_payments <> 'none') then
    v_customers := 'view';
  end if;

  return pg_catalog.jsonb_build_object(
    'customers', v_customers,
    'invoices', v_invoices,
    'payments', v_payments,
    'loans', v_loans
  ) || case when v_source ? 'staff' then jsonb_build_object('staff',case when v_source->>'staff'='edit' then 'edit' else 'none' end) else '{}'::jsonb end;
end;
$$;
create or replace function private.has_store_permission(
  p_store_id uuid,
  p_module text,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_permissions jsonb;
  v_level text;
begin
  if v_user_id is null or p_store_id is null then return false; end if;
  if p_module not in ('customers','invoices','payments','loans','staff') then return false; end if;
  if p_action not in ('view','edit','owner') then return false; end if;

  select sm.role, sm.permissions
    into v_role, v_permissions
  from public.store_members sm
  where sm.store_id = p_store_id
    and sm.user_id = v_user_id;

  if not found then return false; end if;
  if v_role = 'owner' then return true; end if;
  if p_action = 'owner' then return false; end if;

  v_level := private.normalize_store_permissions(v_permissions) ->> p_module;
  if p_action = 'view' then return coalesce(v_level in ('view','edit'),false); end if;
  return coalesce(v_level = 'edit',false);
end;
$$;

-- Legacy staff-only helper name; includes explicitly delegated staff administrators.
create or replace function private.staff_owner(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$select private.has_store_permission(p_store,'staff','edit')$$;

-- Legacy staff-only helper name; includes explicitly delegated staff administrators.
create or replace function private.staff_manager(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$select private.has_store_permission(p_store,'staff','edit')$$;

alter policy "Staff visible to store managers" on public.staff_employees using (private.has_store_permission(store_id,'staff','edit'));

alter policy "Staff settings visible to store managers" on public.staff_store_settings using (private.has_store_permission(store_id,'staff','edit'));

alter policy "Attendance visible to store managers" on public.staff_attendance using (private.has_store_permission(store_id,'staff','edit'));

alter policy "Schedule visible to managers" on public.staff_schedule_history using (private.has_store_permission(store_id,'staff','edit'));

alter policy "History visible to owners" on public.staff_attendance_history using (private.has_store_permission(store_id,'staff','edit'));

alter policy "Owners read lateness rules" on public.staff_late_rules using (private.has_store_permission(store_id,'staff','edit'));

create or replace function private.staff_participants(p_store uuid)
returns table(actor text,name text,owner boolean) language sql stable security definer set search_path='' as $$
 select 'e:'||e.id,e.name,false from public.staff_employees e where e.store_id=p_store and e.active
 union all
 select 'u:'||m.user_id,coalesce(p.full_name,'Удирдлага'),m.role='owner' from public.store_members m left join public.profiles p on p.id=m.user_id where m.store_id=p_store and (m.role='owner' or m.permissions->>'staff'='edit')
$$;
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
create or replace function public.staff_hub_contacts(
  p_store_id uuid default null,
  p_store_token uuid default null,
  p_device_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_store uuid;
  v_employee uuid;
begin
  if p_store_token is not null then
    select s.store_id,e.id into v_store,v_employee
    from public.staff_store_settings s
    join public.staff_employees e on e.store_id=s.store_id and e.active
    join private.staff_credentials c on c.employee_id=e.id
    where s.attendance_token=p_store_token
      and c.device_hash=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex');
  elsif auth.uid() is not null and private.has_store_permission(p_store_id,'staff','edit') then
    v_store:=p_store_id;
  end if;

  if v_store is null then
    raise exception 'Нэвтрэх эрхгүй. Дахин нэвтэрнэ үү.' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_object_agg('e:'||e.id,e.phone)
    from public.staff_employees e
    where e.store_id=v_store and e.active
  ),'{}'::jsonb);
end$$;
