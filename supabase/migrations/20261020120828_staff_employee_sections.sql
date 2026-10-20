-- Employee-owned configuration; all writes require the store owner.
alter table public.staff_employees add column job_title text not null default '', add column duties jsonb not null default '[]', add column duty_notes text not null default '';
create table public.staff_late_rules (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.staff_employees on delete cascade,
 store_id uuid not null references public.stores on delete cascade, effective_from date not null,
 rule jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index staff_late_rules_lookup on public.staff_late_rules(employee_id,effective_from desc,created_at desc);
create index staff_late_rules_store on public.staff_late_rules(store_id);
alter table public.staff_late_rules enable row level security;
revoke all on public.staff_late_rules from public,anon,authenticated;
grant select on public.staff_late_rules to authenticated;
create policy "Owners read lateness rules" on public.staff_late_rules for select to authenticated using(exists(select 1 from public.store_members m where m.store_id=staff_late_rules.store_id and m.user_id=(select auth.uid()) and m.role='owner'));
create function private.staff_late_amount(p_rule jsonb,p_minutes integer) returns numeric language plpgsql immutable set search_path='' as $$
declare mins integer; units numeric; amount numeric;
begin
 if not coalesce((p_rule->>'enabled')::boolean,false) or p_minutes<=coalesce((p_rule->>'grace')::integer,0) then return 0;end if;
 mins:=p_minutes-case when p_rule->>'basis'='all' then 0 else coalesce((p_rule->>'grace')::integer,0) end;
 units:=mins::numeric/greatest(1,(p_rule->>'interval')::integer);
 amount:=(case when p_rule->>'rounding'='ceil' then ceil(units) else floor(units) end)*(p_rule->>'amount')::numeric;
 if p_rule->>'cap' is not null then amount:=least(amount,(p_rule->>'cap')::numeric);end if;
 return greatest(0,round(amount,2));
end$$;
revoke all on function private.staff_late_amount(jsonb,integer) from public,anon,authenticated;
create function public.staff_save_employee_v3(p_store_id uuid,p_employee jsonb) returns public.staff_employees language plpgsql security definer set search_path='' as $$
declare e public.staff_employees;r jsonb:=p_employee->'late_rule';prev public.staff_late_rules;eff date;im jsonb;k text;v text;target_actor text;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн өөрчилнө.';end if;
 if length(coalesce(p_employee->>'job_title',''))>120 or length(coalesce(p_employee->>'duty_notes',''))>4000 or jsonb_typeof(p_employee->'duties') is distinct from 'array' then raise exception 'Чиг үүргийн мэдээлэл буруу байна.';end if;
 if jsonb_array_length(p_employee->'duties')>50 or exists(select 1 from jsonb_array_elements(p_employee->'duties') x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>500) then raise exception 'Үүрэг тус бүр 500 тэмдэгт, нийт 50 хүртэл байна.';end if;
 if r->>'enabled' is null or r->>'grace' is null or r->>'interval' is null or r->>'amount' is null or r->>'basis' is null or r->>'rounding' is null or r is null or jsonb_typeof(r)<>'object' or r->>'enabled' not in ('true','false') or (r->>'grace')::numeric not between 0 and 1440 or (r->>'interval')::numeric not between 1 and 1440 or (r->>'amount')::numeric not between 0 and 100000000 or r->>'basis' not in ('excess','all') or r->>'rounding' not in ('floor','ceil') or ((r->>'cap') is not null and (r->>'cap')::numeric not between 0 and 100000000) or not (r ?& array['enabled','grace','interval','amount','basis','rounding','cap','effective_from']) then raise exception 'Хоцролтын тохиргоог зөв оруулна уу.';end if;
 if (r->>'interval')::numeric<>trunc((r->>'interval')::numeric) or (r->>'grace')::numeric<>trunc((r->>'grace')::numeric) then raise exception 'Минутыг бүхэл тоогоор оруулна уу.';end if;
 eff:=(r->>'effective_from')::date;if eff is null then raise exception 'Мөрдөх огноо оруулна уу.';end if;
 e:=public.staff_save_employee_v2(p_store_id,p_employee);
 update public.staff_employees set job_title=coalesce(p_employee->>'job_title',''),duties=p_employee->'duties',duty_notes=coalesce(p_employee->>'duty_notes','') where id=e.id returning * into e;
 select * into prev from public.staff_late_rules where employee_id=e.id order by effective_from desc,created_at desc,id desc limit 1;
 if prev.id is null or prev.rule is distinct from r then insert into public.staff_late_rules(employee_id,store_id,effective_from,rule) values(e.id,p_store_id,eff,r);end if;
 target_actor:='e:'||e.id;
 if jsonb_typeof(coalesce(p_employee->'images','[]'))<>'array' or jsonb_array_length(coalesce(p_employee->'images','[]'))>20 then raise exception 'Зургийн тоо хэтэрсэн.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||target_actor,0));
 if jsonb_typeof(coalesce(p_employee->'image_removals','[]'))<>'array' then raise exception 'Зургийн мэдээлэл буруу.';end if;
 delete from private.staff_media where store_id=p_store_id and staff_media.actor=target_actor and kind<>'chat' and id::text in (select jsonb_array_elements_text(coalesce(p_employee->'image_removals','[]')));
 for im in select * from jsonb_array_elements(coalesce(p_employee->'images','[]')) loop
  k:=im->>'kind';v:=im->>'image';
  if k is null or k not in ('avatar','id_front','id_back','reference') or v is null or length(v)>1400000 or v !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' then raise exception 'Зураг JPEG хэлбэртэй, 1 MB хүртэл байна.';end if;
  if substring(decode(split_part(v,',',2),'base64') from 1 for 3)<>decode('ffd8ff','hex') then raise exception 'Зургийг уншиж чадсангүй.';end if;
  if k<>'reference' then delete from private.staff_media where store_id=p_store_id and staff_media.actor=target_actor and kind=k;end if;
  insert into private.staff_media(store_id,actor,kind,image) values(p_store_id,target_actor,k,v);
 end loop;
 return e;
end$$;
revoke all on function public.staff_save_employee_v3(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_save_employee_v3(uuid,jsonb) to authenticated;

create or replace function public.staff_review_attendance(p_store_id uuid,p_employee_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_note text,p_overtime boolean,p_expected_updated_at timestamptz)
returns public.staff_attendance language plpgsql security definer set search_path='' as $$
declare e public.staff_employees;a public.staff_attendance;ci timestamptz;co timestamptz;s jsonb;w jsonb;total integer;extra integer; lr jsonb; late_mins integer; deduction numeric;
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
 if a.approval_status='approved' then lr:=coalesce(a.wage_snapshot->'late_rule','{}'::jsonb);
 else select rule into lr from public.staff_late_rules where employee_id=e.id and effective_from<=p_work_date order by effective_from desc,created_at desc,id desc limit 1;lr:=coalesce(lr,'{}'::jsonb);end if;
 late_mins:=case when s->>'start' is null then 0 else greatest(0,floor(extract(epoch from (ci-((p_work_date+(s->>'start')::time) at time zone 'Asia/Ulaanbaatar')))/60)::integer) end;
 deduction:=private.staff_late_amount(lr,late_mins);
 w:=(w-'late_reason')||jsonb_build_object('late_rule',lr,'late_minutes',late_mins,'late_suggested',deduction,'late_deduction',deduction);
 total:=floor(extract(epoch from co-ci));extra:=greatest(0,total-(s->>'seconds')::numeric::integer);
 insert into public.staff_attendance(store_id,employee_id,work_date,clock_in,clock_out,original_clock_in,original_clock_out,edited_by,edit_note,approval_status,approved_by,approved_at,approved_seconds,overtime_seconds,schedule_snapshot,wage_snapshot)
 values(p_store_id,e.id,p_work_date,ci,co,a.clock_in,a.clock_out,auth.uid(),nullif(btrim(p_note),''),'approved',auth.uid(),clock_timestamp(),total-case when coalesce(p_overtime,false) then 0 else extra end,case when coalesce(p_overtime,false) then extra else 0 end,s,w)
 on conflict(employee_id,work_date) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,original_clock_in=coalesce(staff_attendance.original_clock_in,staff_attendance.clock_in),original_clock_out=coalesce(staff_attendance.original_clock_out,staff_attendance.clock_out),edited_by=auth.uid(),edit_note=excluded.edit_note,approval_status='approved',approved_by=auth.uid(),approved_at=clock_timestamp(),approved_seconds=excluded.approved_seconds,overtime_seconds=excluded.overtime_seconds,schedule_snapshot=excluded.schedule_snapshot,wage_snapshot=excluded.wage_snapshot,updated_at=clock_timestamp()
 returning * into a;return a;
end$$;
revoke all on function public.staff_review_attendance(uuid,uuid,date,time,time,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.staff_review_attendance(uuid,uuid,date,time,time,text,boolean,timestamptz) to authenticated;

create function public.staff_review_attendance_v2(p_store_id uuid,p_employee_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_note text,p_overtime boolean,p_expected_updated_at timestamptz,p_deduction numeric default null,p_deduction_reason text default null)
returns public.staff_attendance language plpgsql security definer set search_path='' as $$
declare a public.staff_attendance;
begin
 if not private.staff_owner(p_store_id) then raise exception 'Зөвхөн дэлгүүрийн эзэн цаг батална.';end if;
 if p_deduction is not null and (p_deduction<0 or p_deduction>100000000 or length(btrim(coalesce(p_deduction_reason,'')))=0) then raise exception 'Суутгал өөрчлөх шалтгаан, зөв дүн оруулна уу.';end if;
 a:=public.staff_review_attendance(p_store_id,p_employee_id,p_work_date,p_clock_in,p_clock_out,p_note,p_overtime,p_expected_updated_at);
 if p_deduction is not null then
 update public.staff_attendance set wage_snapshot=wage_snapshot||jsonb_build_object('late_deduction',round(p_deduction,2),'late_reason',p_deduction_reason),updated_at=clock_timestamp() where id=a.id returning * into a;
 end if;return a;
end$$;
revoke all on function public.staff_review_attendance_v2(uuid,uuid,date,time,time,text,boolean,timestamptz,numeric,text) from public,anon,authenticated;
grant execute on function public.staff_review_attendance_v2(uuid,uuid,date,time,time,text,boolean,timestamptz,numeric,text) to authenticated;
notify pgrst,'reload schema';
