-- Edit a loan atomically while preserving every installment already marked paid.

create or replace function public.update_loan_with_schedule(
  p_loan_id uuid,
  p_lender_type text,
  p_lender_name text,
  p_loan_name text,
  p_principal numeric,
  p_annual_interest_rate numeric,
  p_start_date date,
  p_term_months integer,
  p_payment_day integer,
  p_repayment_method text,
  p_rebuild_schedule boolean default true
)
returns table(
  loan_id uuid,
  rebuilt_schedule boolean,
  preserved_paid_count integer,
  pending_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan public.loans%rowtype;
  v_role text;
  v_before jsonb;
  v_rebuild_schedule boolean:=false;
  v_paid_count integer:=0;
  v_pending_count integer:=0;
  v_max_paid_number integer:=0;
  v_paid_principal numeric:=0;
  v_remaining_principal numeric:=0;
  v_remaining_count integer:=0;
  v_monthly_rate numeric:=0;
  v_annuity numeric:=0;
  v_equal_principal numeric:=0;
  v_interest numeric:=0;
  v_principal_part numeric:=0;
  v_total numeric:=0;
  v_installment_number integer;
  v_position integer:=0;
  v_month_start date;
  v_month_last date;
  v_due_date date;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select l.* into v_loan
  from public.loans l
  where l.id=p_loan_id;
  if not found then raise exception 'Loan not found'; end if;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id=v_loan.store_id
    and sm.user_id=(select auth.uid());
  if coalesce(v_role,'') not in ('owner','manager') then
    raise exception 'Only an owner or manager can edit a loan';
  end if;

  -- The existing payment flow locks an installment before it can lock its loan.
  -- Use the same order here, and lock installments consistently by number.
  perform li.id
  from public.loan_installments li
  where li.loan_id=v_loan.id
    and li.store_id=v_loan.store_id
  order by li.installment_number
  for update;

  select l.* into v_loan
  from public.loans l
  where l.id=p_loan_id
    and l.store_id=v_loan.store_id
  for update;
  if not found then raise exception 'Loan not found'; end if;

  if p_lender_type not in ('bank','nbfi','person') then raise exception 'Invalid lender type'; end if;
  if char_length(btrim(coalesce(p_lender_name,''))) not between 1 and 120 then raise exception 'Invalid lender name'; end if;
  if char_length(btrim(coalesce(p_loan_name,''))) not between 1 and 120 then raise exception 'Invalid loan name'; end if;
  if p_principal is null or p_principal<=0 then raise exception 'Loan principal must be greater than zero'; end if;
  if p_annual_interest_rate is null or p_annual_interest_rate<0 or p_annual_interest_rate>1000 then raise exception 'Invalid annual interest rate'; end if;
  if p_start_date is null then raise exception 'Loan start date is required'; end if;
  if p_term_months is null or p_term_months not between 1 and 600 then raise exception 'Invalid loan term'; end if;
  if p_payment_day is null or p_payment_day not between 1 and 31 then raise exception 'Invalid payment day'; end if;
  if p_repayment_method not in ('annuity','equal_principal') then raise exception 'Invalid repayment method'; end if;

  v_before:=jsonb_build_object(
    'lender_type',v_loan.lender_type,
    'lender_name',v_loan.lender_name,
    'loan_name',v_loan.loan_name,
    'principal',v_loan.principal,
    'annual_interest_rate',v_loan.annual_interest_rate,
    'start_date',v_loan.start_date,
    'term_months',v_loan.term_months,
    'payment_day',v_loan.payment_day,
    'repayment_method',v_loan.repayment_method,
    'status',v_loan.status
  );

  -- Never trust the client to skip a rebuild after changing financial terms.
  v_rebuild_schedule:=coalesce(p_rebuild_schedule,false)
    or v_loan.principal is distinct from p_principal
    or v_loan.annual_interest_rate is distinct from p_annual_interest_rate
    or v_loan.start_date is distinct from p_start_date
    or v_loan.term_months is distinct from p_term_months
    or v_loan.payment_day is distinct from p_payment_day
    or v_loan.repayment_method is distinct from p_repayment_method;

  select
    (count(*) filter (where li.status='paid'))::integer,
    coalesce(sum(li.principal_amount) filter (where li.status='paid'),0),
    coalesce(max(li.installment_number) filter (where li.status='paid'),0)
  into v_paid_count,v_paid_principal,v_max_paid_number
  from public.loan_installments li
  where li.loan_id=v_loan.id
    and li.store_id=v_loan.store_id;

  if v_rebuild_schedule then
    if p_term_months<v_max_paid_number then
      raise exception 'Loan term cannot be shorter than paid installment %',v_max_paid_number;
    end if;

    v_remaining_count:=p_term_months-v_paid_count;
    v_remaining_principal:=round(p_principal-v_paid_principal,2);
    if v_remaining_principal<0 then
      raise exception 'Loan principal cannot be less than paid principal %',v_paid_principal;
    end if;
    if v_remaining_count=0 and v_remaining_principal<>0 then
      raise exception 'Increase the loan term to schedule the remaining principal';
    end if;
    if v_remaining_count>0 and v_remaining_principal<=0 then
      raise exception 'Remaining principal must be greater than zero';
    end if;

    delete from public.loan_installments li
    where li.loan_id=v_loan.id
      and li.store_id=v_loan.store_id
      and li.status<>'paid';

    if v_remaining_count>0 then
      v_monthly_rate:=p_annual_interest_rate/1200;
      v_annuity:=case
        when v_monthly_rate=0 then v_remaining_principal/v_remaining_count
        else v_remaining_principal*v_monthly_rate*power(1+v_monthly_rate,v_remaining_count)
          /(power(1+v_monthly_rate,v_remaining_count)-1)
      end;
      v_equal_principal:=v_remaining_principal/v_remaining_count;

      for v_installment_number in
        select series.installment_number
        from generate_series(1,p_term_months) as series(installment_number)
        where not exists (
          select 1
          from public.loan_installments paid
          where paid.loan_id=v_loan.id
            and paid.store_id=v_loan.store_id
            and paid.status='paid'
            and paid.installment_number=series.installment_number
        )
        order by series.installment_number
      loop
        v_position:=v_position+1;
        v_interest:=round(v_remaining_principal*v_monthly_rate,2);
        v_principal_part:=case
          when p_repayment_method='equal_principal' then round(v_equal_principal,2)
          else round(v_annuity-v_interest,2)
        end;
        if v_position=v_remaining_count or v_principal_part>v_remaining_principal then
          v_principal_part:=round(v_remaining_principal,2);
        end if;
        v_total:=round(v_principal_part+v_interest,2);

        v_month_start:=(date_trunc('month',p_start_date)::date+make_interval(months=>v_installment_number))::date;
        v_month_last:=(v_month_start+interval '1 month - 1 day')::date;
        v_due_date:=v_month_start+(least(p_payment_day,extract(day from v_month_last)::integer)-1);

        insert into public.loan_installments(
          loan_id,store_id,installment_number,due_date,principal_amount,
          interest_amount,total_amount,paid_amount,status,paid_at
        ) values (
          v_loan.id,v_loan.store_id,v_installment_number,v_due_date,v_principal_part,
          v_interest,v_total,0,'pending',null
        );

        v_remaining_principal:=round(greatest(v_remaining_principal-v_principal_part,0),2);
      end loop;
    end if;
  end if;

  update public.loans l
  set lender_type=p_lender_type,
      lender_name=btrim(p_lender_name),
      loan_name=btrim(p_loan_name),
      principal=p_principal,
      annual_interest_rate=p_annual_interest_rate,
      start_date=p_start_date,
      term_months=p_term_months,
      payment_day=p_payment_day,
      repayment_method=p_repayment_method,
      status=case
        when v_rebuild_schedule and v_remaining_count=0 then 'closed'
        when v_rebuild_schedule then 'active'
        else l.status
      end,
      updated_at=now()
  where l.id=v_loan.id
    and l.store_id=v_loan.store_id;

  select count(*)::integer into v_pending_count
  from public.loan_installments li
  where li.loan_id=v_loan.id
    and li.store_id=v_loan.store_id
    and li.status<>'paid';

  insert into public.finance_audit_events(
    store_id,entity_type,entity_id,action,actor_id,details
  ) values (
    v_loan.store_id,'loan',v_loan.id,'loan_edited',(select auth.uid()),
    jsonb_build_object(
      'before',v_before,
      'after',jsonb_build_object(
        'lender_type',p_lender_type,
        'lender_name',btrim(p_lender_name),
        'loan_name',btrim(p_loan_name),
        'principal',p_principal,
        'annual_interest_rate',p_annual_interest_rate,
        'start_date',p_start_date,
        'term_months',p_term_months,
        'payment_day',p_payment_day,
        'repayment_method',p_repayment_method
      ),
      'schedule_rebuilt',v_rebuild_schedule,
      'paid_installments_preserved',v_paid_count,
      'pending_installments',v_pending_count
    )
  );

  return query select v_loan.id,v_rebuild_schedule,v_paid_count,v_pending_count;
end;
$$;

revoke execute on function public.update_loan_with_schedule(
  uuid,text,text,text,numeric,numeric,date,integer,integer,text,boolean
) from public,anon;
grant execute on function public.update_loan_with_schedule(
  uuid,text,text,text,numeric,numeric,date,integer,integer,text,boolean
) to authenticated;
