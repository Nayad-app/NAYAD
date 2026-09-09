-- Avoid recalculating auth.uid() for every row in the two loan insert policies.
drop policy if exists "Permitted members can create loans" on public.loans;
create policy "Permitted members can create loans" on public.loans for insert to authenticated
with check (created_by=(select auth.uid()) and private.has_store_permission(store_id,'loans','edit'));

drop policy if exists "Permitted members can create loan documents" on public.loan_documents;
create policy "Permitted members can create loan documents" on public.loan_documents for insert to authenticated
with check (created_by=(select auth.uid()) and private.has_store_permission(store_id,'loans','edit'));
