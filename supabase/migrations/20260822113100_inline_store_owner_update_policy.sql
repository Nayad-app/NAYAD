-- Keep the owner check inside the RLS policy. This avoids exposing an extra
-- SECURITY DEFINER helper as a callable RPC endpoint.
drop policy if exists "Owners can update their stores" on public.stores;
create policy "Owners can update their stores"
on public.stores
for update
to authenticated
using (
  exists (
    select 1
    from public.store_members sm
    where sm.store_id = stores.id
      and sm.user_id = (select auth.uid())
      and sm.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.store_members sm
    where sm.store_id = stores.id
      and sm.user_id = (select auth.uid())
      and sm.role = 'owner'
  )
);

revoke all on function public.is_store_owner(uuid) from public, anon, authenticated;
drop function if exists public.is_store_owner(uuid);
