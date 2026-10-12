-- Optional transfer instructions; existing loans and cached clients remain compatible.
alter table public.loans add column payment_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(payment_details)='object');

create function public.save_contract_loan_v2(
  p_store_id uuid, p_loan_id uuid, p_expected_revision integer,
  p_lender_type text, p_lender_name text, p_loan_name text,
  p_principal numeric, p_start_date date, p_payment_day integer, p_rows jsonb,
  p_request_id uuid, p_payment_details jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_existing uuid; v_before jsonb; v_details jsonb:='{}'; v_key text; v_value text;
begin
  if auth.uid() is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=auth.uid() and sm.role in ('owner','manager'))
    or not private.has_store_permission(p_store_id,'loans','edit') then raise exception 'Зээл засах эрхгүй байна.'; end if;
  if jsonb_typeof(p_payment_details) is distinct from 'object' then raise exception 'Дансны мэдээллээ шалгана уу.'; end if;
  foreach v_key in array array['bank','holder','iban','account','reference'] loop
    if p_payment_details ? v_key and jsonb_typeof(p_payment_details->v_key) not in ('string','null') then raise exception 'Дансны мэдээллээ шалгана уу.'; end if;
    v_value:=btrim(coalesce(p_payment_details->>v_key,''));
    if v_key in ('iban','account') then v_value:=regexp_replace(v_value,'\s','','g'); end if;
    if v_key='iban' then v_value:=upper(v_value); end if;
    if char_length(v_value)>(case when v_key='reference' then 300 else 120 end) then raise exception 'Дансны мэдээлэл хэт урт байна.'; end if;
    v_details:=v_details||jsonb_build_object(v_key,v_value);
  end loop;
  if p_loan_id is null and p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    select l.id,l.payment_details into v_existing,v_before from public.loans l where l.schedule_request_id=p_request_id and l.store_id=p_store_id and l.created_by=auth.uid();
    if found and v_before<>v_details then raise exception 'Зээл өмнө нь хадгалагдсан байна. Дахин нээж засна уу.'; end if;
  end if;
  -- Existing RPC validates ownership, revisions, paid rows and the complete schedule.
  v_id:=public.save_contract_loan(p_store_id,p_loan_id,p_expected_revision,p_lender_type,p_lender_name,p_loan_name,p_principal,p_start_date,p_payment_day,p_rows,p_request_id);
  if v_existing is not null then return v_id; end if;
  select l.payment_details into v_before from public.loans l where l.id=v_id;
  update public.loans set payment_details=v_details where id=v_id;
  if v_before is distinct from v_details then
    insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
    values(p_store_id,'loan',v_id,'loan_edited',auth.uid(),jsonb_build_object('before_payment_details',v_before,'after_payment_details',v_details));
  end if;
  return v_id;
end; $$;
revoke all on function public.save_contract_loan_v2(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.save_contract_loan_v2(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb) to authenticated;

-- Record only after explicit confirmation; atomically close a fully paid loan.
create function public.record_loan_installment_payment(p_store_id uuid,p_loan_id uuid,p_installment_id uuid,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_loan public.loans%rowtype; v_row public.loan_installments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=auth.uid() and sm.role in ('owner','manager'))
    or not private.has_store_permission(p_store_id,'loans','edit') then raise exception 'Төлөлт бүртгэх эрхгүй байна.'; end if;
  perform li.id from public.loan_installments li where li.loan_id=p_loan_id and li.store_id=p_store_id order by li.installment_number for update;
  select l.* into v_loan from public.loans l where l.id=p_loan_id and l.store_id=p_store_id for update;
  if not found then raise exception 'Зээл олдсонгүй.'; end if;
  select li.* into v_row from public.loan_installments li where li.id=p_installment_id and li.loan_id=p_loan_id and li.store_id=p_store_id;
  if not found then raise exception 'Төлөлт олдсонгүй.'; end if;
  if v_row.status='paid' then return; end if;
  if p_expected_revision is distinct from v_loan.schedule_revision then raise exception 'Мэдээлэл өөрчлөгдсөн байна. Цонхоо дахин нээнэ үү.'; end if;
  update public.loan_installments set status='paid',paid_amount=total_amount,paid_at=now() where id=v_row.id;
  update public.loans l set status=case when exists(select 1 from public.loan_installments li where li.loan_id=l.id and li.status<>'paid') then 'active' else 'closed' end,updated_at=now() where l.id=v_loan.id;
end; $$;
revoke all on function public.record_loan_installment_payment(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.record_loan_installment_payment(uuid,uuid,uuid,integer) to authenticated;
