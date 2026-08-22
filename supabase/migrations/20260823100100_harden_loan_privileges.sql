-- Keep the loan Data API surface limited to the operations used by NAYAD.
revoke all on public.loans, public.loan_installments, public.loan_documents from anon, authenticated;

grant select, insert, delete on public.loans to authenticated;
grant update (status, updated_at) on public.loans to authenticated;
grant select, insert on public.loan_installments to authenticated;
grant update (status, paid_amount, paid_at) on public.loan_installments to authenticated;
grant select, insert, delete on public.loan_documents to authenticated;
