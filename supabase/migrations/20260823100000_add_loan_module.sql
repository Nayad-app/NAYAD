-- NAYAD loan ledger and private contract storage.

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  lender_type text not null check (lender_type in ('bank', 'nbfi', 'person')),
  lender_name text not null check (char_length(btrim(lender_name)) between 1 and 120),
  loan_name text not null check (char_length(btrim(loan_name)) between 1 and 120),
  principal numeric(14,2) not null check (principal > 0),
  annual_interest_rate numeric(7,4) not null default 0 check (annual_interest_rate >= 0 and annual_interest_rate <= 1000),
  start_date date not null,
  term_months integer not null check (term_months between 1 and 600),
  payment_day integer not null check (payment_day between 1 and 31),
  repayment_method text not null default 'annuity' check (repayment_method in ('annuity', 'equal_principal')),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id)
);

create table if not exists public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null,
  store_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_amount numeric(14,2) not null check (principal_amount >= 0),
  interest_amount numeric(14,2) not null check (interest_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (loan_id, installment_number),
  foreign key (loan_id, store_id) references public.loans(id, store_id) on delete cascade
);

create table if not exists public.loan_documents (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null,
  store_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')),
  page_number integer not null check (page_number > 0),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (loan_id, page_number),
  foreign key (loan_id, store_id) references public.loans(id, store_id) on delete cascade
);

create index if not exists loans_store_status_idx on public.loans (store_id, status);
create index if not exists loans_created_by_idx on public.loans (created_by);
create index if not exists loan_installments_store_due_idx on public.loan_installments (store_id, status, due_date);
create index if not exists loan_installments_loan_store_idx on public.loan_installments (loan_id, store_id);
create index if not exists loan_documents_store_id_idx on public.loan_documents (store_id);
create index if not exists loan_documents_loan_store_idx on public.loan_documents (loan_id, store_id);
create index if not exists loan_documents_created_by_idx on public.loan_documents (created_by);

alter table public.loans enable row level security;
alter table public.loan_installments enable row level security;
alter table public.loan_documents enable row level security;

drop policy if exists "Finance members can view loans" on public.loans;
create policy "Finance members can view loans" on public.loans
for select to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loans.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can create loans" on public.loans;
create policy "Finance members can create loans" on public.loans
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.store_members sm
    where sm.store_id = loans.store_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner', 'manager')
  )
);

drop policy if exists "Finance members can update loans" on public.loans;
create policy "Finance members can update loans" on public.loans
for update to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loans.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
))
with check (exists (
  select 1 from public.store_members sm
  where sm.store_id = loans.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can delete loans" on public.loans;
create policy "Finance members can delete loans" on public.loans
for delete to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loans.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can view loan installments" on public.loan_installments;
create policy "Finance members can view loan installments" on public.loan_installments
for select to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_installments.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can create loan installments" on public.loan_installments;
create policy "Finance members can create loan installments" on public.loan_installments
for insert to authenticated
with check (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_installments.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can update loan installments" on public.loan_installments;
create policy "Finance members can update loan installments" on public.loan_installments
for update to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_installments.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
))
with check (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_installments.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can view loan documents" on public.loan_documents;
create policy "Finance members can view loan documents" on public.loan_documents
for select to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_documents.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

drop policy if exists "Finance members can create loan documents" on public.loan_documents;
create policy "Finance members can create loan documents" on public.loan_documents
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.store_members sm
    where sm.store_id = loan_documents.store_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner', 'manager')
  )
);

drop policy if exists "Finance members can delete loan documents" on public.loan_documents;
create policy "Finance members can delete loan documents" on public.loan_documents
for delete to authenticated
using (exists (
  select 1 from public.store_members sm
  where sm.store_id = loan_documents.store_id
    and sm.user_id = (select auth.uid())
    and sm.role in ('owner', 'manager')
));

revoke all on public.loans, public.loan_installments, public.loan_documents from anon;
grant select, insert, update, delete on public.loans to authenticated;
grant select, insert, update on public.loan_installments to authenticated;
grant select, insert, delete on public.loan_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loan-contracts',
  'loan-contracts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Finance members can view loan contract files" on storage.objects;
create policy "Finance members can view loan contract files" on storage.objects
for select to authenticated
using (
  bucket_id = 'loan-contracts'
  and exists (
    select 1 from public.store_members sm
    where sm.store_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner', 'manager')
  )
);

drop policy if exists "Finance members can upload loan contract files" on storage.objects;
create policy "Finance members can upload loan contract files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'loan-contracts'
  and exists (
    select 1 from public.store_members sm
    where sm.store_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner', 'manager')
  )
);

drop policy if exists "Finance members can delete loan contract files" on storage.objects;
create policy "Finance members can delete loan contract files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'loan-contracts'
  and exists (
    select 1 from public.store_members sm
    where sm.store_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner', 'manager')
  )
);
