-- Return only active employee phone numbers after validating the same owner or
-- employee device credentials used by the private staff hub.
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
  elsif auth.uid() is not null and exists(
    select 1 from public.store_members m
    where m.store_id=p_store_id and m.user_id=auth.uid() and m.role='owner'
  ) then
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

revoke all on function public.staff_hub_contacts(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_hub_contacts(uuid,uuid,text) to anon,authenticated;
