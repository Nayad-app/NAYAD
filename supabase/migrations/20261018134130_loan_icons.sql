alter table public.loans add column icon text check(icon in ('bank','nbfi','person','rent','power','other'));
create function private.save_contract_loan_v3(
 p_store_id uuid,p_loan_id uuid,p_expected_revision integer,
 p_lender_type text,p_lender_name text,p_loan_name text,
 p_principal numeric,p_start_date date,p_payment_day integer,p_rows jsonb,
 p_request_id uuid,p_payment_details jsonb,p_icon text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_icon text;
begin
 if auth.uid() is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=auth.uid() and sm.role in ('owner','manager'))
 or not private.has_store_permission(p_store_id,'loans','edit') then raise exception 'Зээл засах эрхгүй байна.'; end if;
 if p_icon is null or p_icon not in ('bank','nbfi','person','rent','power','other') then raise exception 'Icon сонгоно уу.'; end if;
 if p_loan_id is null and p_request_id is not null then
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select l.icon into v_icon from public.loans l where l.schedule_request_id=p_request_id and l.store_id=p_store_id and l.created_by=auth.uid();
 if found and v_icon is distinct from p_icon then raise exception 'Зээл өмнө нь хадгалагдсан байна. Дахин нээж засна уу.'; end if;
 end if;
 v_id:=public.save_contract_loan_v2(p_store_id,p_loan_id,p_expected_revision,p_lender_type,p_lender_name,p_loan_name,p_principal,p_start_date,p_payment_day,p_rows,p_request_id,p_payment_details);
 update public.loans set icon=p_icon where id=v_id and store_id=p_store_id;
 return v_id;
end; $$;
revoke all on function private.save_contract_loan_v3(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb,text) from public,anon;
grant execute on function private.save_contract_loan_v3(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb,text) to authenticated;

create function public.save_contract_loan_v3(
 p_store_id uuid,p_loan_id uuid,p_expected_revision integer,p_lender_type text,p_lender_name text,p_loan_name text,
 p_principal numeric,p_start_date date,p_payment_day integer,p_rows jsonb,p_request_id uuid,p_payment_details jsonb,p_icon text
) returns uuid language sql security invoker set search_path='' as $$
 select private.save_contract_loan_v3(p_store_id,p_loan_id,p_expected_revision,p_lender_type,p_lender_name,p_loan_name,p_principal,p_start_date,p_payment_day,p_rows,p_request_id,p_payment_details,p_icon);
$$;
revoke all on function public.save_contract_loan_v3(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb,text) from public,anon;
grant execute on function public.save_contract_loan_v3(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid,jsonb,text) to authenticated;
