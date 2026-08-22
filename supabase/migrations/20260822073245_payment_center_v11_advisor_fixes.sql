-- Cover new foreign keys and avoid duplicate permissive SELECT policies.

create index if not exists due_notifications_store_id_idx
  on public.due_notifications(store_id);
create index if not exists due_notifications_invoice_id_idx
  on public.due_notifications(invoice_id);
create index if not exists finance_audit_events_actor_id_idx
  on public.finance_audit_events(actor_id);
create index if not exists invoice_agreements_created_by_idx
  on public.invoice_agreements(created_by);
create index if not exists invoices_created_by_idx
  on public.invoices(created_by);
create index if not exists invoices_confirmed_by_idx
  on public.invoices(confirmed_by);
create index if not exists invoices_cancelled_by_idx
  on public.invoices(cancelled_by);
create index if not exists notification_preferences_user_id_idx
  on public.notification_preferences(user_id);
create index if not exists payments_created_by_idx
  on public.payments(created_by);
create index if not exists payments_reversed_by_idx
  on public.payments(reversed_by);

drop policy if exists "Users can update notification preferences" on public.notification_preferences;
drop policy if exists "Users can insert notification preferences" on public.notification_preferences;
create policy "Users can insert notification preferences" on public.notification_preferences
  for insert to authenticated
  with check (user_id=(select auth.uid()) and public.is_store_member(store_id));
create policy "Users can update notification preferences" on public.notification_preferences
  for update to authenticated
  using (user_id=(select auth.uid()) and public.is_store_member(store_id))
  with check (user_id=(select auth.uid()) and public.is_store_member(store_id));

revoke references,trigger on public.invoices,public.payments from anon,authenticated;
revoke references,trigger on public.payment_allocations,public.invoice_agreements,
  public.finance_audit_events,public.due_notifications from authenticated;
