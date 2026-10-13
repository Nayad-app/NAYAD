alter table public.loans add column manually_closed boolean not null default false;
alter table public.loans add column has_payment_history boolean not null default false;
-- A manual closure must survive schedule edits and payment reversals.
create function public.preserve_manual_loan_closure() returns trigger language plpgsql set search_path='' as $$
begin
 if new.manually_closed then new.status:='closed'; end if;
 return new;
end; $$;
create trigger preserve_manual_loan_closure before insert or update on public.loans for each row execute function public.preserve_manual_loan_closure();
revoke all on function public.preserve_manual_loan_closure() from public,anon,authenticated;

create function public.manage_loan_action(p_store_id uuid,p_loan_id uuid,p_revision integer,p_action text,p_installment_id uuid default null,p_confirmation text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.loans%rowtype; r public.loan_installments%rowtype; paths jsonb; before_row jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=auth.uid() and sm.role in ('owner','manager')) or not private.has_store_permission(p_store_id,'loans','edit') then raise exception 'Зээл өөрчлөх эрхгүй байна.'; end if;
 if p_action is null or p_action not in ('close','delete','reverse') then raise exception 'Үйлдэл буруу байна.'; end if;
 perform li.id from public.loan_installments li where li.loan_id=p_loan_id and li.store_id=p_store_id order by li.installment_number for update;
 select x.* into l from public.loans x where x.id=p_loan_id and x.store_id=p_store_id for update;
 if not found then raise exception 'Зээл олдсонгүй.'; end if;
 if p_revision is distinct from l.schedule_revision then raise exception 'Мэдээлэл өөрчлөгдсөн байна. Дахин нээж оролдоно уу.'; end if;
 if p_action='reverse' then
  select li.* into r from public.loan_installments li where li.id=p_installment_id and li.loan_id=l.id and li.store_id=p_store_id;
  if not found or r.status<>'paid' then raise exception 'Төлсөн төлөлт олдсонгүй.'; end if;
  before_row:=to_jsonb(r);
  update public.loans set has_payment_history=true where id=l.id;
  update public.loan_installments set status='pending',paid_amount=0,paid_at=null where id=r.id;
  update public.loans set status=case when manually_closed then 'closed' else 'active' end,updated_at=now() where id=l.id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details) values(p_store_id,'loan',l.id,'loan_payment_reversed',auth.uid(),jsonb_build_object('installment_id',r.id,'before',before_row,'lender_name',l.lender_name,'amount',r.paid_amount));
 elsif p_action='close' then
  update public.loans set manually_closed=true,status='closed',schedule_revision=schedule_revision+1,updated_at=now() where id=l.id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details) values(p_store_id,'loan',l.id,'loan_closed',auth.uid(),jsonb_build_object('lender_name',l.lender_name,'previous_status',l.status));
 else
  if not exists(select 1 from public.store_members sm where sm.store_id=p_store_id and sm.user_id=auth.uid() and sm.role='owner') then raise exception 'Зээлийг зөвхөн эзэн устгана.'; end if;
  if p_confirmation is distinct from 'устгах' then raise exception '«устгах» гэж бичнэ үү.'; end if;
  if l.has_payment_history or exists(select 1 from public.loan_installments li where li.loan_id=l.id and (li.status='paid' or li.paid_amount>0)) then raise exception 'Төлөлтийн түүхтэй зээлийг устгахгүй. Зээл хаахыг ашиглана уу.'; end if;
  select coalesce(jsonb_agg(d.storage_path),'[]'::jsonb) into paths from public.loan_documents d where d.loan_id=l.id and d.store_id=p_store_id;
  insert into public.finance_audit_events(store_id,entity_type,entity_id,action,actor_id,details) values(p_store_id,'loan',l.id,'loan_deleted',auth.uid(),jsonb_build_object('lender_name',l.lender_name,'loan_name',l.loan_name,'principal',l.principal));
  delete from public.loans where id=l.id;
  return jsonb_build_object('paths',paths);
 end if;
 return '{}'::jsonb;
end; $$;
revoke all on function public.manage_loan_action(uuid,uuid,integer,text,uuid,text) from public,anon;
grant execute on function public.manage_loan_action(uuid,uuid,integer,text,uuid,text) to authenticated;
-- Deletion must go through typed confirmation and the history guard.
revoke delete on public.loans from authenticated;

create or replace function public.record_loan_installment_payment(p_store_id uuid,p_loan_id uuid,p_installment_id uuid,p_expected_revision integer)
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
  if v_loan.manually_closed then raise exception 'Хаасан зээлд төлөлт бүртгэхгүй.'; end if;
  if v_row.status='paid' then return; end if;
  if p_expected_revision is distinct from v_loan.schedule_revision then raise exception 'Мэдээлэл өөрчлөгдсөн байна. Цонхоо дахин нээнэ үү.'; end if;
  update public.loan_installments set status='paid',paid_amount=total_amount,paid_at=now() where id=v_row.id;
  update public.loans l set has_payment_history=true,status=case when exists(select 1 from public.loan_installments li where li.loan_id=l.id and li.status<>'paid') then 'active' else 'closed' end,updated_at=now() where l.id=v_loan.id;
end; $$;
revoke all on function public.record_loan_installment_payment(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.record_loan_installment_payment(uuid,uuid,uuid,integer) to authenticated;
