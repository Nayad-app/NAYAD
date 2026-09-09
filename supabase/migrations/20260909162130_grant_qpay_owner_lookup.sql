-- QPay billing verifies store ownership through the backend service client.
-- The service role remains backend-only; authenticated clients keep read-only,
-- row-scoped access through the existing RLS policy.
grant select on table public.store_members to service_role;
