alter table public.suppliers
  add column if not exists contact_type text,
  add column if not exists contact_phone text,
  add column if not exists contact_note text,
  add column if not exists bank_account_holder text;

update public.suppliers
set contact_type='organization'
where contact_type is null or contact_type not in ('person','organization');

alter table public.suppliers
  alter column contact_type set default 'organization',
  alter column contact_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='suppliers_contact_type_check'
      and conrelid='public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_contact_type_check
      check (contact_type in ('person','organization'));
  end if;
end $$;
