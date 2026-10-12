-- Exact lender schedules; no fabricated interest split when only totals are known.
alter table public.loans drop constraint loans_repayment_method_check;
alter table public.loans add constraint loans_repayment_method_check check (repayment_method in ('annuity','equal_principal','contract'));
alter table public.loan_installments alter column principal_amount drop not null;
alter table public.loan_installments alter column interest_amount drop not null;
alter table public.loans add column if not exists schedule_request_id uuid unique;
alter table public.loans add column if not exists schedule_revision integer not null default 0;

-- Bump revision on every installment write, including payments from another device.
create or replace function public.loan_schedule_revision_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.loans l set schedule_revision=l.schedule_revision+1 where l.id=coalesce(new.loan_id,old.loan_id);
  return coalesce(new,old);
end; $$;
revoke all on function public.loan_schedule_revision_changed() from public,anon,authenticated;
create trigger loan_schedule_revision_changed after insert or update or delete on public.loan_installments
for each row execute function public.loan_schedule_revision_changed();

create or replace function public.save_contract_loan(
  p_store_id uuid, p_loan_id uuid, p_expected_revision integer,
  p_lender_type text, p_lender_name text, p_loan_name text,
  p_principal numeric, p_start_date date, p_payment_day integer, p_rows jsonb, p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid; v_old public.loans%rowtype; v_user uuid := auth.uid();
  v_row jsonb; v_num integer:=0; v_date date; v_prev date:=p_start_date;
  v_total numeric; v_principal numeric; v_interest numeric; v_sum numeric:=0;
  v_principal_sum numeric:=0; v_known boolean:=true; v_status text; v_paid_at timestamptz;
  v_saved public.loan_installments%rowtype; v_count integer; v_today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  v_before jsonb;
begin
  if v_user is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=v_user and sm.role in ('owner','manager')) then
    raise exception 'Зээлийн мэдээлэл засах эрхгүй байна.';
  end if;
  if not private.has_store_permission(p_store_id,'loans','edit') then raise exception 'Зээл засах эрхгүй байна.'; end if;
  if p_loan_id is null and p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    select l.id into v_id from public.loans l where l.schedule_request_id=p_request_id and l.store_id=p_store_id and l.created_by=v_user;
    if found then
      if not exists(select 1 from public.loans l where l.id=v_id and l.principal=p_principal and l.start_date=p_start_date and l.payment_day=p_payment_day and l.lender_type=p_lender_type and l.lender_name=btrim(p_lender_name) and l.loan_name=btrim(p_loan_name)) or
        exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.loan_installments li where li.loan_id=v_id and li.installment_number=(r->>'installment_number')::integer and li.due_date=(r->>'due_date')::date and li.total_amount=(r->>'total_amount')::numeric and li.principal_amount is not distinct from (r->>'principal_amount')::numeric and li.interest_amount is not distinct from (r->>'interest_amount')::numeric and li.status=r->>'status' and li.paid_at is not distinct from (r->>'paid_at')::timestamptz)) or
        jsonb_array_length(p_rows)<>(select count(*) from public.loan_installments li where li.loan_id=v_id) then
        raise exception 'Зээл өмнө нь хадгалагдсан байна. Жагсаалтаас дахин нээж засна уу.';
      end if;
      return v_id;
    end if;
  end if;
  if p_lender_type is null or p_lender_type not in ('bank','nbfi','person') or
    char_length(btrim(coalesce(p_lender_name,''))) not between 1 and 120 or
    char_length(btrim(coalesce(p_loan_name,''))) not between 1 and 120 then raise exception 'Зээл олгогч, нэрийг шалгана уу.'; end if;
  if p_principal is null or p_principal::text in ('NaN','Infinity','-Infinity') or p_principal<=0 or p_principal>999999999999.99 or round(p_principal,2)<>p_principal or p_start_date is null or p_start_date<'1900-01-01' or p_payment_day is null or p_payment_day not between 1 and 31 then raise exception 'Зээлийн дүн, огноо, төлөх өдрийг шалгана уу.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Хуваарь шаардлагатай.'; end if;
  v_count:=jsonb_array_length(p_rows);
  if v_count not between 1 and 600 then raise exception 'Төлөлтийн тоо 1–600 байна.'; end if;
  if p_loan_id is not null then
    -- Same lock order as the existing edit/payment flow.
    perform li.id from public.loan_installments li where li.loan_id=p_loan_id and li.store_id=p_store_id order by li.installment_number for update;
    select l.* into v_old from public.loans l where l.id=p_loan_id and l.store_id=p_store_id for update;
    if not found then raise exception 'Зээл олдсонгүй.'; end if;
    if p_expected_revision is distinct from v_old.schedule_revision then raise exception 'Зээл өөр төхөөрөмжөөс өөрчлөгдсөн байна. Дахин нээж засна уу.'; end if;
    v_id:=v_old.id;
    select jsonb_agg(to_jsonb(li) order by li.installment_number) into v_before from public.loan_installments li where li.loan_id=v_id;
    if exists(select 1 from public.loan_installments li where li.loan_id=v_id and li.status='paid' and li.installment_number>v_count) then raise exception 'Төлсөн мөрийг хасах боломжгүй.'; end if;
  else
    v_id:=gen_random_uuid();
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_num:=v_num+1;
    if (v_row->>'installment_number')::integer is distinct from v_num then raise exception 'Хуваарийн дараалал буруу байна.'; end if;
    v_date:=(v_row->>'due_date')::date; v_total:=(v_row->>'total_amount')::numeric;
    v_principal:=(v_row->>'principal_amount')::numeric; v_interest:=(v_row->>'interest_amount')::numeric;
    v_status:=v_row->>'status'; v_paid_at:=(v_row->>'paid_at')::timestamptz;
    if v_date is null or v_date<=v_prev or v_total is null or v_total::text in ('NaN','Infinity','-Infinity') or v_total<=0 or v_total>999999999999.99 or round(v_total,2)<>v_total then raise exception '%-р төлөлтийн огноо, дүн буруу байна.',v_num; end if;
    v_prev:=v_date; v_sum:=v_sum+v_total;
    if v_principal is null and v_interest is null then v_known:=false;
    elsif v_principal is null or v_interest is null or v_principal::text in ('NaN','Infinity','-Infinity') or v_interest::text in ('NaN','Infinity','-Infinity') or v_principal<0 or v_interest<0 or round(v_principal,2)<>v_principal or round(v_interest,2)<>v_interest or v_principal+v_interest<>v_total then raise exception '%-р төлөлтийн үндсэн дүн + хүү нийт дүнтэй тэнцэх ёстой.',v_num;
    else v_principal_sum:=v_principal_sum+v_principal; end if;
    if v_status is null or v_status not in ('pending','paid') then raise exception 'Төлөв буруу байна.'; end if;
    select li.* into v_saved from public.loan_installments li where li.loan_id=v_id and li.installment_number=v_num;
    if found and v_saved.status='paid' then
      if v_saved.due_date is distinct from v_date or v_saved.total_amount is distinct from v_total or v_saved.principal_amount is distinct from v_principal or v_saved.interest_amount is distinct from v_interest or v_status<>'paid' or v_saved.paid_at is distinct from v_paid_at then raise exception 'Төлсөн мөрийн түүхийг өөрчилж болохгүй.'; end if;
    else
      if p_loan_id is not null and v_status='paid' then raise exception 'Төлөлтийг зээлийн дэлгэрэнгүй хэсгээс тэмдэглэнэ үү.'; end if;
      if v_status='paid' and (v_paid_at is null or (v_paid_at at time zone 'Asia/Ulaanbaatar')::date>v_today or (v_paid_at at time zone 'Asia/Ulaanbaatar')::date<p_start_date) then raise exception 'Төлсөн огноог шалгана уу.'; end if;
      if v_status='pending' and v_paid_at is not null then raise exception 'Төлөөгүй мөр төлсөн огноогүй байна.'; end if;
    end if;
  end loop;
  if v_sum<p_principal or v_principal_sum>p_principal or (v_known and v_principal_sum<>p_principal) then raise exception 'Хуваарийн нийлбэр зээлийн үндсэн дүнтэй таарахгүй байна.'; end if;

  if p_loan_id is null then
    insert into public.loans(id,store_id,lender_type,lender_name,loan_name,principal,annual_interest_rate,start_date,term_months,payment_day,repayment_method,status,created_by,schedule_request_id)
    values(v_id,p_store_id,p_lender_type,btrim(p_lender_name),btrim(p_loan_name),p_principal,0,p_start_date,v_count,p_payment_day,'contract','active',v_user,p_request_id);
  else
    update public.loans l set lender_type=p_lender_type,lender_name=btrim(p_lender_name),loan_name=btrim(p_loan_name),principal=p_principal,start_date=p_start_date,term_months=v_count,payment_day=p_payment_day,repayment_method='contract',schedule_revision=l.schedule_revision+1,updated_at=now() where l.id=v_id;
    delete from public.loan_installments li where li.loan_id=v_id and li.status<>'paid' and li.installment_number>v_count;
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.loan_installments(loan_id,store_id,installment_number,due_date,total_amount,principal_amount,interest_amount,status,paid_amount,paid_at)
    values(v_id,p_store_id,(v_row->>'installment_number')::integer,(v_row->>'due_date')::date,(v_row->>'total_amount')::numeric,(v_row->>'principal_amount')::numeric,(v_row->>'interest_amount')::numeric,v_row->>'status',case when v_row->>'status'='paid' then (v_row->>'total_amount')::numeric else 0 end,(v_row->>'paid_at')::timestamptz)
    on conflict(loan_id,installment_number) do update set due_date=excluded.due_date,total_amount=excluded.total_amount,principal_amount=excluded.principal_amount,interest_amount=excluded.interest_amount
    where public.loan_installments.status<>'paid';
  end loop;
  update public.loans l set status=case when exists(select 1 from public.loan_installments li where li.loan_id=v_id and li.status<>'paid') then 'active' else 'closed' end where l.id=v_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details)
  values(p_store_id,'loan',v_id,case when p_loan_id is null then 'loan_created' else 'loan_edited' end,v_user,jsonb_build_object('schedule_mode','contract','before_schedule',v_before,'after_schedule',p_rows,'principal',p_principal));
  return v_id;
end; $$;
revoke execute on function public.save_contract_loan(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid) from public,anon;
grant execute on function public.save_contract_loan(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid) to authenticated;
