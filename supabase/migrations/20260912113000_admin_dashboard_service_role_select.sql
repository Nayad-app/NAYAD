-- The administrator dashboard reads these two tables through a server-only
-- Edge Function. Keep the grant read-only and limited to the selected fields.
grant select (id, full_name, phone, created_at)
on table public.profiles
to service_role;

grant select (
  id,
  name,
  business_type,
  operation_role,
  entity_type,
  registration_completed_at,
  created_at
)
on table public.stores
to service_role;
