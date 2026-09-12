-- System-administrator access is intentionally separate from per-registration
-- owner/manager/staff membership. Browser clients receive no direct table
-- privileges; the authenticated admin Edge Function is the only reader.
create table if not exists public.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.system_admins is
  'NAYAD system administrators allowed to read cross-registration billing summaries.';

alter table public.system_admins enable row level security;

revoke all on table public.system_admins from public, anon, authenticated;
grant select on table public.system_admins to service_role;

-- Bootstrap the approved NAYAD administrator through the server-owned phone
-- login identity. The admin Edge Function never authorizes by phone number.
insert into public.system_admins (user_id)
select account.user_id
from public.phone_login_accounts account
where account.phone = '+97699000031'
on conflict (user_id) do nothing;
