create or replace function public.is_auth_email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.deleted_at is null
  );
$$;

revoke all on function public.is_auth_email_registered(text) from public, anon, authenticated;
grant execute on function public.is_auth_email_registered(text) to service_role;
