create table public.store_invoice_cart (
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index store_invoice_cart_store_idx on public.store_invoice_cart(store_id);
alter table public.store_invoice_cart enable row level security;
revoke all on public.store_invoice_cart from anon, authenticated;
grant select, insert, delete on public.store_invoice_cart to authenticated;
create policy cart_read on public.store_invoice_cart for select to authenticated
using (private.has_store_permission(store_id,'invoices','view') and exists (select 1 from public.invoices i where i.id=invoice_id and i.store_id=store_invoice_cart.store_id and coalesce(i.status,'confirmed')='confirmed' and i.amount>coalesce(i.paid,0)));
create policy cart_add on public.store_invoice_cart for insert to authenticated
with check (created_by=(select auth.uid()) and private.has_store_permission(store_id,'invoices','view') and exists (select 1 from public.invoices i where i.id=invoice_id and i.store_id=store_invoice_cart.store_id and coalesce(i.status,'confirmed')='confirmed' and i.amount>coalesce(i.paid,0)));
create policy cart_remove on public.store_invoice_cart for delete to authenticated
using (private.has_store_permission(store_id,'invoices','view'));
-- Internal invariant: payment/cancellation removes the shared selection atomically.
create function private.clear_settled_invoice_cart() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new.status,'confirmed')<>'confirmed' or new.amount<=coalesce(new.paid,0) or new.store_id is distinct from old.store_id then
    delete from public.store_invoice_cart where invoice_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.clear_settled_invoice_cart() from public,anon,authenticated;
create trigger clear_settled_invoice_cart after update of amount,paid,status,store_id on public.invoices for each row execute function private.clear_settled_invoice_cart();
