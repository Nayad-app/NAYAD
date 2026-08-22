revoke references,trigger on public.invoices,public.payments from anon,authenticated;
revoke references,trigger on public.payment_allocations,public.invoice_agreements,
  public.finance_audit_events,public.due_notifications from authenticated;
