-- Delete one owned registration without touching the login account or any
-- other owned/shared registration. Storage objects are returned to the Edge
-- Function and removed through the supported Storage API after commit.

create or replace function private.delete_my_registration_impl(
  p_store_id uuid,
  p_confirmation text
)
returns table(
  deleted_store_id uuid,
  deleted_store_name text,
  invoice_image_paths text[],
  loan_document_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_name text;
  v_role text;
  v_invoice_image_paths text[] := array[]::text[];
  v_loan_document_paths text[] := array[]::text[];
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_store_id is null then
    raise exception 'Registration is required';
  end if;
  if p_confirmation is distinct from 'УСТГАХ' then
    raise exception 'Confirmation required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text, 0)
  );

  select s.name, sm.role
    into v_store_name, v_role
  from public.stores s
  join public.store_members sm
    on sm.store_id = s.id
   and sm.user_id = v_user_id
  where s.id = p_store_id
  for update of s, sm;

  if not found or v_role <> 'owner' then
    raise exception 'Registration not found or owner access required';
  end if;

  -- Lock every target-side FK parent and mutable relationship row before the
  -- integrity preflight. Concurrent tabs may still read, but cannot create or
  -- move a cross-registration reference between the check and the deletes.
  perform s.id
  from public.suppliers s
  where s.store_id = p_store_id
  order by s.id
  for update of s;

  perform i.id
  from public.invoices i
  where i.store_id = p_store_id
  order by i.id
  for update of i;

  perform p.id
  from public.payments p
  where p.store_id = p_store_id
  order by p.id
  for update of p;

  perform pa.payment_id
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  join public.invoices i on i.id = pa.invoice_id
  where p.store_id = p_store_id or i.store_id = p_store_id
  order by pa.payment_id, pa.invoice_id
  for update of pa;

  perform ia.invoice_id
  from public.invoice_agreements ia
  join public.invoices i on i.id = ia.invoice_id
  where ia.store_id = p_store_id or i.store_id = p_store_id
  order by ia.invoice_id
  for update of ia;

  perform dn.id
  from public.due_notifications dn
  join public.invoices i on i.id = dn.invoice_id
  where dn.store_id = p_store_id or i.store_id = p_store_id
  order by dn.id
  for update of dn;

  perform l.id
  from public.loans l
  where l.store_id = p_store_id
  order by l.id
  for update of l;

  perform qo.id
  from public.qpay_orders qo
  where qo.store_id = p_store_id
  order by qo.id
  for update of qo;

  perform ss.store_id
  from public.store_subscriptions ss
  left join public.qpay_orders qo on qo.id = ss.last_order_id
  where ss.store_id = p_store_id or qo.store_id = p_store_id
  order by ss.store_id
  for update of ss;

  -- A payment allocation must never bridge registrations. Refuse deletion
  -- instead of mutating another registration if legacy data violates this.
  if exists (
    select 1
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    join public.invoices i on i.id = pa.invoice_id
    where (p.store_id = p_store_id or i.store_id = p_store_id)
      and p.store_id <> i.store_id
  ) then
    raise exception 'Cross-registration payment allocation found';
  end if;

  -- Several legacy foreign keys carry both a business row and store_id but do
  -- not enforce that both sides belong to the same registration. Cascading a
  -- mismatched row could otherwise mutate another registration owned by the
  -- same account. Abort before deleting anything if such a link touches the
  -- selected registration.
  if exists (
    select 1
    from public.invoices i
    join public.suppliers s on s.id = i.supplier_id
    where i.store_id <> s.store_id
      and (i.store_id = p_store_id or s.store_id = p_store_id)
    union all
    select 1
    from public.payments p
    join public.suppliers s on s.id = p.supplier_id
    where p.store_id <> s.store_id
      and (p.store_id = p_store_id or s.store_id = p_store_id)
    union all
    select 1
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p.store_id <> i.store_id
      and (p.store_id = p_store_id or i.store_id = p_store_id)
    union all
    select 1
    from public.invoice_agreements ia
    join public.invoices i on i.id = ia.invoice_id
    where ia.store_id <> i.store_id
      and (ia.store_id = p_store_id or i.store_id = p_store_id)
    union all
    select 1
    from public.due_notifications dn
    join public.invoices i on i.id = dn.invoice_id
    where dn.store_id <> i.store_id
      and (dn.store_id = p_store_id or i.store_id = p_store_id)
    union all
    select 1
    from public.store_subscriptions ss
    join public.qpay_orders qo on qo.id = ss.last_order_id
    where ss.store_id <> qo.store_id
      and (ss.store_id = p_store_id or qo.store_id = p_store_id)
  ) then
    raise exception 'Cross-registration relationship found';
  end if;

  select coalesce(
    pg_catalog.array_agg(distinct ii.image_path order by ii.image_path)
      filter (where ii.image_path is not null and pg_catalog.btrim(ii.image_path) <> ''),
    array[]::text[]
  )
    into v_invoice_image_paths
  from public.invoice_images ii
  where exists (
    select 1
    from public.invoices i
    where i.store_id = p_store_id
      and i.id::text = ii.invoice_id
  );

  select coalesce(
    pg_catalog.array_agg(distinct ld.storage_path order by ld.storage_path)
      filter (where pg_catalog.btrim(ld.storage_path) <> ''),
    array[]::text[]
  )
    into v_loan_document_paths
  from public.loan_documents ld
  where ld.store_id = p_store_id;

  -- Keep the owner membership until every permission-guarded child row has
  -- been removed. payment_allocations must precede both payments and invoices
  -- because both foreign keys intentionally use ON DELETE RESTRICT.
  delete from public.payment_allocations pa
  where exists (
    select 1 from public.payments p
    where p.id = pa.payment_id and p.store_id = p_store_id
  ) or exists (
    select 1 from public.invoices i
    where i.id = pa.invoice_id and i.store_id = p_store_id
  );

  delete from public.invoice_images ii
  where exists (
    select 1 from public.invoices i
    where i.store_id = p_store_id and i.id::text = ii.invoice_id
  );
  delete from public.due_notifications where store_id = p_store_id;
  delete from public.invoice_agreements where store_id = p_store_id;
  delete from public.payments where store_id = p_store_id;
  delete from public.invoices where store_id = p_store_id;
  delete from public.suppliers where store_id = p_store_id;

  delete from public.loan_documents where store_id = p_store_id;
  delete from public.loan_installments where store_id = p_store_id;
  delete from public.loans where store_id = p_store_id;

  delete from public.notification_preferences where store_id = p_store_id;
  delete from public.finance_audit_events where store_id = p_store_id;
  delete from public.store_subscriptions where store_id = p_store_id;
  delete from public.qpay_orders where store_id = p_store_id;
  delete from public.store_invites where store_id = p_store_id;
  delete from public.store_members where store_id = p_store_id;

  delete from public.stores where id = p_store_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Registration deletion failed';
  end if;

  return query
  select
    p_store_id,
    v_store_name,
    v_invoice_image_paths,
    v_loan_document_paths;
end;
$$;

revoke all on function private.delete_my_registration_impl(uuid, text)
from public, anon, authenticated;
grant execute on function private.delete_my_registration_impl(uuid, text)
to authenticated;

create or replace function public.delete_my_registration(
  p_store_id uuid,
  p_confirmation text
)
returns table(
  deleted_store_id uuid,
  deleted_store_name text,
  invoice_image_paths text[],
  loan_document_paths text[]
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.delete_my_registration_impl(p_store_id, p_confirmation);
$$;

revoke all on function public.delete_my_registration(uuid, text)
from public, anon, authenticated;
grant execute on function public.delete_my_registration(uuid, text)
to authenticated;
