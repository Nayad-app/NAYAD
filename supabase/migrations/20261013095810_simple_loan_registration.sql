-- A simple schedule tracks future payments without inventing an original principal.
alter table public.loans alter column principal drop not null;
alter table public.loans add constraint loans_unknown_principal_contract_only
  check (principal is not null or repayment_method='contract');

-- Preserve the existing atomic save, authorization, revision and paid-history checks.
do $$
declare body text; original text;
begin
  original:=pg_get_functiondef('public.save_contract_loan(uuid,uuid,integer,text,text,text,numeric,date,integer,jsonb,uuid)'::regprocedure);
  body:=replace(original,'l.principal=p_principal','l.principal is not distinct from p_principal');
  body:=replace(body,'if p_principal is null or p_principal::text','if p_principal::text');
  body:=replace(body,'if v_sum<p_principal or v_principal_sum>p_principal or (v_known and v_principal_sum<>p_principal) then',
    'if (p_principal is null and exists(select 1 from jsonb_array_elements(p_rows) r where (r->>''principal_amount'') is not null or (r->>''interest_amount'') is not null)) or v_sum<p_principal or v_principal_sum>p_principal or (v_known and v_principal_sum<>p_principal) then');
  if body=original or position('if p_principal is null or p_principal::text' in body)>0 or position('p_principal is null and exists' in body)=0 then
    raise exception 'Unexpected contract save definition; migration stopped';
  end if;
  execute body;
end $$;
