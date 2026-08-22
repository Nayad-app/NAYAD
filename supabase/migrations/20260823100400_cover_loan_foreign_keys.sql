-- Composite foreign keys need indexes in the same column order.
create index if not exists loan_installments_loan_store_idx
  on public.loan_installments (loan_id, store_id);

create index if not exists loan_documents_loan_store_idx
  on public.loan_documents (loan_id, store_id);

drop index if exists public.loan_installments_loan_id_idx;
drop index if exists public.loan_documents_loan_id_idx;
