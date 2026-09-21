alter table public.suppliers
  add column if not exists bank_iban text;

comment on column public.suppliers.bank_iban is
  'Optional local IBAN prefix stored separately from bank_account. The client copies MN + bank_iban + bank_account as the full IBAN.';
