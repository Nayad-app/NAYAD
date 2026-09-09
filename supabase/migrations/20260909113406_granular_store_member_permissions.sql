-- Per-member, per-module access for shared stores.
-- Owners always retain full access. Shared members can receive none/view/edit
-- independently for customers, invoices, payments and loans. Destructive
-- deletes remain owner-only.

alter table public.store_members
  add column if not exists permissions jsonb not null
  default '{"customers":"view","invoices":"view","payments":"view","loans":"none"}'::jsonb;

alter table public.store_invites
  add column if not exists permissions jsonb not null
  default '{"customers":"view","invoices":"view","payments":"view","loans":"none"}'::jsonb;

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
  );
end;
$$;

revoke all on function private.normalize_store_permissions(jsonb) from public, anon, authenticated;
grant execute on function private.normalize_store_permissions(jsonb) to authenticated;

update public.store_members
set permissions = case
  when role = 'owner' then '{"customers":"edit","invoices":"edit","payments":"edit","loans":"edit"}'::jsonb
  when role = 'manager' then '{"customers":"edit","invoices":"edit","payments":"edit","loans":"edit"}'::jsonb
  else '{"customers":"edit","invoices":"edit","payments":"edit","loans":"none"}'::jsonb
end;

update public.store_invites
set permissions = case
  when role = 'manager' then '{"customers":"edit","invoices":"edit","payments":"edit","loans":"edit"}'::jsonb
  else '{"customers":"view","invoices":"view","payments":"view","loans":"none"}'::jsonb
end;

alter table public.store_members
  drop constraint if exists store_members_permissions_valid;
alter table public.store_members
  add constraint store_members_permissions_valid check (
    pg_catalog.jsonb_typeof(permissions) = 'object'
    and permissions = private.normalize_store_permissions(permissions)
  );

alter table public.store_invites
  drop constraint if exists store_invites_permissions_valid;
alter table public.store_invites
  add constraint store_invites_permissions_valid check (
    pg_catalog.jsonb_typeof(permissions) = 'object'
    and permissions = private.normalize_store_permissions(permissions)
  );

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
  if p_module not in ('customers','invoices','payments','loans') then return false; end if;
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
  if p_action = 'view' then return v_level in ('view','edit'); end if;
  return v_level = 'edit';
end;
$$;

revoke all on function private.has_store_permission(uuid,text,text) from public, anon, authenticated;
grant execute on function private.has_store_permission(uuid,text,text) to authenticated;

create or replace function private.create_store_invite_with_permissions_impl(
  p_store_id uuid,
  p_email text,
  p_permissions jsonb
)
returns public.store_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.store_invites;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_permissions jsonb := private.normalize_store_permissions(p_permissions);
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_store_permission(p_store_id,'customers','owner') then
    raise exception 'Only the store owner can invite members';
  end if;
  if v_email is null or v_email = '' or pg_catalog.char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Valid email is required';
  end if;
  if not (v_permissions ?| array['customers','invoices','payments','loans'])
     or not exists (
       select 1 from pg_catalog.jsonb_each_text(v_permissions) p
       where p.value in ('view','edit')
     ) then
    raise exception 'At least one permission is required';
  end if;

  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and pg_catalog.lower(u.email) = v_email
  ) then raise exception 'You are already the owner of this store'; end if;

  if exists (
    select 1 from public.store_members sm
    join auth.users u on u.id = sm.user_id
    where sm.store_id = p_store_id and pg_catalog.lower(u.email) = v_email
  ) then raise exception 'This user is already a store member'; end if;

  if exists (
    select 1 from public.store_invites si
    where si.inviter_id = auth.uid() and si.store_id = p_store_id
      and pg_catalog.lower(si.invitee_email) = v_email
      and si.created_at > pg_catalog.now() - interval '1 minute'
  ) then raise exception 'Ижил хаяг руу дахин урихын өмнө 1 минут хүлээнэ үү.'; end if;

  if (
    select pg_catalog.count(*) from public.store_invites si
    where si.inviter_id = auth.uid()
      and si.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 20 then raise exception 'Нэг цагийн урилгын хязгаарт хүрлээ.'; end if;

  update public.store_invites set status = 'revoked'
  where store_id = p_store_id and pg_catalog.lower(invitee_email) = v_email and status = 'pending';

  v_role := case when exists (
    select 1 from pg_catalog.jsonb_each_text(v_permissions) p where p.value = 'edit'
  ) then 'manager' else 'staff' end;

  insert into public.store_invites(store_id,inviter_id,invitee_email,role,permissions)
  values (p_store_id,auth.uid(),v_email,v_role,v_permissions)
  returning * into v_invite;
  return v_invite;
end;
$$;

revoke all on function private.create_store_invite_with_permissions_impl(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function private.create_store_invite_with_permissions_impl(uuid,text,jsonb) to authenticated;

create or replace function public.create_store_invite_with_permissions(
  p_store_id uuid,
  p_email text,
  p_permissions jsonb
)
returns public.store_invites
language sql
security invoker
set search_path = ''
as $$
  select private.create_store_invite_with_permissions_impl(p_store_id,p_email,p_permissions);
$$;

revoke all on function public.create_store_invite_with_permissions(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_store_invite_with_permissions(uuid,text,jsonb) to authenticated;

create or replace function public.create_store_invite(p_store_id uuid,p_email text)
returns public.store_invites
language sql
security invoker
set search_path = ''
as $$
  select private.create_store_invite_with_permissions_impl(
    p_store_id,p_email,
    '{"customers":"view","invoices":"view","payments":"view","loans":"none"}'::jsonb
  );
$$;

revoke all on function public.create_store_invite(uuid,text) from public, anon, authenticated;
grant execute on function public.create_store_invite(uuid,text) to authenticated;

create or replace function public.accept_store_invite(p_token uuid)
returns public.store_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.store_invites;
  v_member public.store_members;
  v_email text;
  v_permissions jsonb;
  v_role text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_invite from public.store_invites
  where token=p_token and status='pending' for update;
  if not found then raise exception 'Invite not found or no longer active'; end if;
  if v_invite.expires_at < pg_catalog.now() then
    update public.store_invites set status='expired' where id=v_invite.id;
    raise exception 'Invite has expired';
  end if;
  select pg_catalog.lower(u.email) into v_email from auth.users u where u.id=v_user_id;
  if v_email is null or v_email <> pg_catalog.lower(v_invite.invitee_email) then
    raise exception 'This invite is for a different email address';
  end if;

  v_permissions := private.normalize_store_permissions(v_invite.permissions);
  v_role := case when exists (
    select 1 from pg_catalog.jsonb_each_text(v_permissions) p where p.value='edit'
  ) then 'manager' else 'staff' end;

  insert into public.store_members(store_id,user_id,role,permissions)
  values (v_invite.store_id,v_user_id,v_role,v_permissions)
  on conflict (store_id,user_id) do update set
    role=case when public.store_members.role='owner' then 'owner' else excluded.role end,
    permissions=case when public.store_members.role='owner' then public.store_members.permissions else excluded.permissions end
  returning * into v_member;
  update public.store_invites set status='accepted',accepted_at=pg_catalog.now() where id=v_invite.id;
  return v_member;
end;
$$;

revoke all on function public.accept_store_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_store_invite(uuid) to authenticated;

create or replace function private.update_store_member_permissions_impl(
  p_store_id uuid,
  p_user_id uuid,
  p_permissions jsonb
)
returns public.store_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permissions jsonb := private.normalize_store_permissions(p_permissions);
  v_role text;
  v_member public.store_members;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_store_permission(p_store_id,'customers','owner') then
    raise exception 'Only the store owner can change member permissions';
  end if;
  if not exists (select 1 from pg_catalog.jsonb_each_text(v_permissions) p where p.value in ('view','edit')) then
    raise exception 'At least one permission is required';
  end if;
  if exists (
    select 1 from public.store_members sm
    where sm.store_id=p_store_id and sm.user_id=p_user_id and sm.role='owner'
  ) then raise exception 'Owner permissions cannot be changed'; end if;

  v_role := case when exists (
    select 1 from pg_catalog.jsonb_each_text(v_permissions) p where p.value='edit'
  ) then 'manager' else 'staff' end;

  update public.store_members set permissions=v_permissions,role=v_role
  where store_id=p_store_id and user_id=p_user_id and role<>'owner'
  returning * into v_member;
  if not found then raise exception 'Store member not found'; end if;
  return v_member;
end;
$$;

revoke all on function private.update_store_member_permissions_impl(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.update_store_member_permissions_impl(uuid,uuid,jsonb) to authenticated;

create or replace function public.update_store_member_permissions(
  p_store_id uuid,p_user_id uuid,p_permissions jsonb
)
returns public.store_members
language sql security invoker set search_path=''
as $$ select private.update_store_member_permissions_impl(p_store_id,p_user_id,p_permissions); $$;

revoke all on function public.update_store_member_permissions(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_store_member_permissions(uuid,uuid,jsonb) to authenticated;

create or replace function private.remove_store_member_impl(p_store_id uuid,p_user_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_store_permission(p_store_id,'customers','owner') then
    raise exception 'Only the store owner can remove members';
  end if;
  if exists (
    select 1 from public.store_members sm
    where sm.store_id=p_store_id and sm.user_id=p_user_id and sm.role='owner'
  ) then raise exception 'The store owner cannot be removed'; end if;
  delete from public.store_members
  where store_id=p_store_id and user_id=p_user_id and role<>'owner';
  if not found then raise exception 'Store member not found'; end if;
  return true;
end;
$$;

revoke all on function private.remove_store_member_impl(uuid,uuid) from public, anon, authenticated;
grant execute on function private.remove_store_member_impl(uuid,uuid) to authenticated;

create or replace function public.remove_store_member(p_store_id uuid,p_user_id uuid)
returns boolean
language sql security invoker set search_path=''
as $$ select private.remove_store_member_impl(p_store_id,p_user_id); $$;

revoke all on function public.remove_store_member(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remove_store_member(uuid,uuid) to authenticated;

create or replace function public.get_my_stores_with_permissions()
returns table(user_id uuid,id uuid,name text,role text,permissions jsonb,created_at timestamptz)
language sql security invoker set search_path=''
as $$
  select auth.uid(),s.id,s.name,sm.role,
         private.normalize_store_permissions(sm.permissions),sm.created_at
  from public.store_members sm
  join public.stores s on s.id=sm.store_id
  where sm.user_id=auth.uid()
  order by case when sm.role='owner' then 0 else 1 end,sm.created_at;
$$;

revoke all on function public.get_my_stores_with_permissions() from public, anon, authenticated;
grant execute on function public.get_my_stores_with_permissions() to authenticated;

create or replace function private.get_store_members_with_permissions_impl(p_store_id uuid)
returns table(user_id uuid,role text,permissions jsonb,full_name text,email text)
language sql security definer set search_path=''
as $$
  select sm.user_id,sm.role,private.normalize_store_permissions(sm.permissions),p.full_name,u.email
  from public.store_members sm
  left join public.profiles p on p.id=sm.user_id
  left join auth.users u on u.id=sm.user_id
  where sm.store_id=p_store_id
    and private.has_store_permission(p_store_id,'customers','owner')
  order by case when sm.role='owner' then 0 else 1 end,p.full_name nulls last,u.email;
$$;

revoke all on function private.get_store_members_with_permissions_impl(uuid) from public, anon, authenticated;
grant execute on function private.get_store_members_with_permissions_impl(uuid) to authenticated;

create or replace function public.get_store_members_with_permissions(p_store_id uuid)
returns table(user_id uuid,role text,permissions jsonb,full_name text,email text)
language sql security invoker set search_path=''
as $$ select * from private.get_store_members_with_permissions_impl(p_store_id); $$;

revoke all on function public.get_store_members_with_permissions(uuid) from public, anon, authenticated;
grant execute on function public.get_store_members_with_permissions(uuid) to authenticated;

-- Data API policies now enforce the selected module level.
drop policy if exists "Members can view suppliers" on public.suppliers;
drop policy if exists "Members can create suppliers" on public.suppliers;
drop policy if exists "Members can update suppliers" on public.suppliers;
drop policy if exists "Members can delete suppliers" on public.suppliers;
create policy "Permitted members can view suppliers" on public.suppliers for select to authenticated
using (private.has_store_permission(store_id,'customers','view'));
create policy "Permitted members can create suppliers" on public.suppliers for insert to authenticated
with check (private.has_store_permission(store_id,'customers','edit'));
create policy "Permitted members can update suppliers" on public.suppliers for update to authenticated
using (private.has_store_permission(store_id,'customers','edit'))
with check (private.has_store_permission(store_id,'customers','edit'));
create policy "Owners can delete suppliers" on public.suppliers for delete to authenticated
using (private.has_store_permission(store_id,'customers','owner'));

drop policy if exists "Members can view invoices" on public.invoices;
drop policy if exists "Members can create invoices" on public.invoices;
drop policy if exists "Members can update invoices" on public.invoices;
drop policy if exists "Members can delete invoices" on public.invoices;
create policy "Permitted members can view invoices" on public.invoices for select to authenticated
using (private.has_store_permission(store_id,'invoices','view'));
create policy "Permitted members can create invoices" on public.invoices for insert to authenticated
with check (private.has_store_permission(store_id,'invoices','edit'));
create policy "Permitted members can update invoices" on public.invoices for update to authenticated
using (private.has_store_permission(store_id,'invoices','edit'))
with check (private.has_store_permission(store_id,'invoices','edit'));
create policy "Owners can delete invoices" on public.invoices for delete to authenticated
using (private.has_store_permission(store_id,'invoices','owner'));

drop policy if exists "Members can view payments" on public.payments;
drop policy if exists "Members can create payments" on public.payments;
drop policy if exists "Members can update payments" on public.payments;
drop policy if exists "Members can delete payments" on public.payments;
create policy "Permitted members can view payments" on public.payments for select to authenticated
using (private.has_store_permission(store_id,'payments','view'));
create policy "Permitted members can create payments" on public.payments for insert to authenticated
with check (private.has_store_permission(store_id,'payments','edit'));
create policy "Permitted members can update payments" on public.payments for update to authenticated
using (private.has_store_permission(store_id,'payments','edit'))
with check (private.has_store_permission(store_id,'payments','edit'));
create policy "Owners can delete payments" on public.payments for delete to authenticated
using (private.has_store_permission(store_id,'payments','owner'));

drop policy if exists "Finance members can view loans" on public.loans;
drop policy if exists "Finance members can create loans" on public.loans;
drop policy if exists "Finance members can update loans" on public.loans;
drop policy if exists "Finance members can delete loans" on public.loans;
create policy "Permitted members can view loans" on public.loans for select to authenticated
using (private.has_store_permission(store_id,'loans','view'));
create policy "Permitted members can create loans" on public.loans for insert to authenticated
with check (created_by=auth.uid() and private.has_store_permission(store_id,'loans','edit'));
create policy "Permitted members can update loans" on public.loans for update to authenticated
using (private.has_store_permission(store_id,'loans','edit'))
with check (private.has_store_permission(store_id,'loans','edit'));
create policy "Owners can delete loans" on public.loans for delete to authenticated
using (private.has_store_permission(store_id,'loans','owner'));

drop policy if exists "Finance members can view loan installments" on public.loan_installments;
drop policy if exists "Finance members can create loan installments" on public.loan_installments;
drop policy if exists "Finance members can update loan installments" on public.loan_installments;
create policy "Permitted members can view loan installments" on public.loan_installments for select to authenticated
using (private.has_store_permission(store_id,'loans','view'));
create policy "Permitted members can create loan installments" on public.loan_installments for insert to authenticated
with check (private.has_store_permission(store_id,'loans','edit'));
create policy "Permitted members can update loan installments" on public.loan_installments for update to authenticated
using (private.has_store_permission(store_id,'loans','edit'))
with check (private.has_store_permission(store_id,'loans','edit'));

drop policy if exists "Finance members can view loan documents" on public.loan_documents;
drop policy if exists "Finance members can create loan documents" on public.loan_documents;
drop policy if exists "Finance members can delete loan documents" on public.loan_documents;
create policy "Permitted members can view loan documents" on public.loan_documents for select to authenticated
using (private.has_store_permission(store_id,'loans','view'));
create policy "Permitted members can create loan documents" on public.loan_documents for insert to authenticated
with check (created_by=auth.uid() and private.has_store_permission(store_id,'loans','edit'));
create policy "Owners can delete loan documents" on public.loan_documents for delete to authenticated
using (private.has_store_permission(store_id,'loans','owner'));

drop policy if exists "Members can view payment allocations" on public.payment_allocations;
create policy "Permitted members can view payment allocations" on public.payment_allocations for select to authenticated
using (exists(select 1 from public.payments p where p.id=payment_id and private.has_store_permission(p.store_id,'payments','view')));

drop policy if exists "Members can view invoice agreements" on public.invoice_agreements;
create policy "Permitted members can view invoice agreements" on public.invoice_agreements for select to authenticated
using (private.has_store_permission(store_id,'invoices','view'));

drop policy if exists "Members can view finance audit" on public.finance_audit_events;
create policy "Permitted members can view finance audit" on public.finance_audit_events for select to authenticated
using (private.has_store_permission(store_id,'invoices','view') or private.has_store_permission(store_id,'payments','view'));

alter table public.invoice_images enable row level security;
drop policy if exists "Allow invoice image page access" on public.invoice_images;
create policy "Permitted members can view invoice image rows" on public.invoice_images for select to authenticated
using (exists(select 1 from public.invoices i where i.id::text=invoice_id and private.has_store_permission(i.store_id,'invoices','view')));
create policy "Permitted members can create invoice image rows" on public.invoice_images for insert to authenticated
with check (exists(select 1 from public.invoices i where i.id::text=invoice_id and private.has_store_permission(i.store_id,'invoices','edit')));
create policy "Owners can delete invoice image rows" on public.invoice_images for delete to authenticated
using (exists(select 1 from public.invoices i where i.id::text=invoice_id and private.has_store_permission(i.store_id,'invoices','owner')));
revoke all privileges on table public.invoice_images from anon;
grant select,insert,update,delete on table public.invoice_images to authenticated;

-- Private invoice images: URLs are generated only for members with invoice view access.
update storage.buckets set public=false where id='invoice-images';
drop policy if exists "Allow invoice image uploads 1itej2w_0" on storage.objects;
drop policy if exists "Finance members can delete invoice image files" on storage.objects;
drop policy if exists "Permitted members can view invoice image files" on storage.objects;
drop policy if exists "Permitted members can upload invoice image files" on storage.objects;
drop policy if exists "Permitted members can update invoice image files" on storage.objects;
drop policy if exists "Owners can delete invoice image files" on storage.objects;
create policy "Permitted members can view invoice image files" on storage.objects for select to authenticated
using (bucket_id='invoice-images' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'invoices','view'));
create policy "Permitted members can upload invoice image files" on storage.objects for insert to authenticated
with check (bucket_id='invoice-images' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'invoices','edit'));
create policy "Permitted members can update invoice image files" on storage.objects for update to authenticated
using (bucket_id='invoice-images' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'invoices','edit'))
with check (bucket_id='invoice-images' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'invoices','edit'));
create policy "Owners can delete invoice image files" on storage.objects for delete to authenticated
using (bucket_id='invoice-images' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'invoices','owner'));

-- Loan file access follows the loan module selection. Deletes remain owner-only.
drop policy if exists "Finance members can view loan contract files" on storage.objects;
drop policy if exists "Finance members can upload loan contract files" on storage.objects;
drop policy if exists "Finance members can delete loan contract files" on storage.objects;
create policy "Permitted members can view loan contract files" on storage.objects for select to authenticated
using (bucket_id='loan-contracts' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'loans','view'));
create policy "Permitted members can upload loan contract files" on storage.objects for insert to authenticated
with check (bucket_id='loan-contracts' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'loans','edit'));
create policy "Owners can delete loan contract files" on storage.objects for delete to authenticated
using (bucket_id='loan-contracts' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.has_store_permission(((storage.foldername(name))[1])::uuid,'loans','owner'));

-- Trigger guard closes SECURITY DEFINER bypasses: granular editors may pass a
-- legacy manager check, but every actual write is still checked by module.
create or replace function private.enforce_store_module_permission()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_row jsonb := case when tg_op='DELETE' then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  v_store_id uuid;
  v_module text := tg_argv[0];
  v_allowed boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='invoice_images' then
    select i.store_id into v_store_id from public.invoices i where i.id::text=v_row->>'invoice_id';
  else
    v_store_id := nullif(v_row->>'store_id','')::uuid;
  end if;
  if tg_op='DELETE' then
    v_allowed := private.has_store_permission(v_store_id,v_module,'owner');
  elsif tg_table_name='invoices' and tg_op='UPDATE' then
    v_allowed := private.has_store_permission(v_store_id,'invoices','edit')
      or private.has_store_permission(v_store_id,'payments','edit');
  else
    v_allowed := private.has_store_permission(v_store_id,v_module,'edit');
  end if;
  if not coalesce(v_allowed,false) then raise exception 'Permission denied for % %',v_module,pg_catalog.lower(tg_op); end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.enforce_store_module_permission() from public, anon, authenticated;

drop trigger if exists enforce_customer_permissions on public.suppliers;
create trigger enforce_customer_permissions before insert or update or delete on public.suppliers
for each row execute function private.enforce_store_module_permission('customers');
drop trigger if exists enforce_invoice_permissions on public.invoices;
create trigger enforce_invoice_permissions before insert or update or delete on public.invoices
for each row execute function private.enforce_store_module_permission('invoices');
drop trigger if exists enforce_invoice_image_permissions on public.invoice_images;
create trigger enforce_invoice_image_permissions before insert or update or delete on public.invoice_images
for each row execute function private.enforce_store_module_permission('invoices');
drop trigger if exists enforce_invoice_agreement_permissions on public.invoice_agreements;
create trigger enforce_invoice_agreement_permissions before insert or update or delete on public.invoice_agreements
for each row execute function private.enforce_store_module_permission('invoices');
drop trigger if exists enforce_payment_permissions on public.payments;
create trigger enforce_payment_permissions before insert or update or delete on public.payments
for each row execute function private.enforce_store_module_permission('payments');
drop trigger if exists enforce_loan_permissions on public.loans;
create trigger enforce_loan_permissions before insert or update or delete on public.loans
for each row execute function private.enforce_store_module_permission('loans');
drop trigger if exists enforce_loan_installment_permissions on public.loan_installments;
create trigger enforce_loan_installment_permissions before insert or update or delete on public.loan_installments
for each row execute function private.enforce_store_module_permission('loans');
drop trigger if exists enforce_loan_document_permissions on public.loan_documents;
create trigger enforce_loan_document_permissions before insert or update or delete on public.loan_documents
for each row execute function private.enforce_store_module_permission('loans');
