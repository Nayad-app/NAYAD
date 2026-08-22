-- Prevent clients from changing loan ownership, amounts or schedule identity after creation.
revoke update on public.loans, public.loan_installments from authenticated;

grant update (status, updated_at) on public.loans to authenticated;
grant update (status, paid_amount, paid_at) on public.loan_installments to authenticated;
