-- Optional reusable bank transfer reference; existing supplier RLS remains in force.
alter table public.suppliers add column if not exists payment_reference varchar(120);
