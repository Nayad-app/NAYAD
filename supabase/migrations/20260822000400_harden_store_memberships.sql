-- Store membership is an authorization boundary. Client roles may read their
-- memberships, but every membership write must go through a reviewed RPC.

alter table public.store_members enable row level security;

drop policy if exists "Users can create their membership" on public.store_members;
drop policy if exists "Users can update their membership" on public.store_members;

revoke all privileges on table public.store_members from anon, authenticated;
grant select on table public.store_members to authenticated;

-- A shared membership is not the user's own store. Serialize this operation per
-- user so concurrent startup requests cannot create two owner stores.
create or replace function public.ensure_my_store()
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_store_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select s.id, s.name
    into v_store_id, v_store_name
  from public.stores s
  join public.store_members sm on sm.store_id = s.id
  where sm.user_id = v_user_id
    and sm.role = 'owner'
  order by s.created_at asc
  limit 1;

  if v_store_id is null then
    select coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(u.email, '@', 1), ''),
      'NAYAD'
    ) || ' store'
      into v_store_name
    from auth.users u
    where u.id = v_user_id;

    v_store_id := gen_random_uuid();

    insert into public.stores (id, name)
    values (v_store_id, coalesce(v_store_name, 'NAYAD store'));

    insert into public.store_members (store_id, user_id, role)
    values (v_store_id, v_user_id, 'owner');
  end if;

  return query select v_store_id, v_store_name;
end;
$$;

-- Invite acceptance is deliberately one-way: only the authenticated invitee is
-- added to the store named by the invite. It never grants the inviter access to
-- any store owned by the invitee.
create or replace function public.accept_store_invite(p_token uuid)
returns public.store_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.store_invites;
  v_member public.store_members;
  v_email text;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.store_invites
  where token = p_token
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found or no longer active';
  end if;

  if v_invite.expires_at < now() then
    update public.store_invites
       set status = 'expired'
     where id = v_invite.id;
    raise exception 'Invite has expired';
  end if;

  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_email <> lower(v_invite.invitee_email) then
    raise exception 'This invite is for a different email address';
  end if;

  v_role := case
    when v_invite.role = 'manager' then 'manager'
    else 'staff'
  end;

  insert into public.store_members (store_id, user_id, role)
  values (v_invite.store_id, v_user_id, v_role)
  on conflict (store_id, user_id) do update
    set role = case
      when public.store_members.role = 'owner' then 'owner'
      else excluded.role
    end
  returning * into v_member;

  update public.store_invites
     set status = 'accepted', accepted_at = now()
   where id = v_invite.id;

  return v_member;
end;
$$;

-- SECURITY DEFINER functions must never inherit PostgreSQL's default PUBLIC
-- execute privilege. Only signed-in users may call the user-facing RPCs.
revoke all on function public.ensure_my_store() from public, anon, authenticated;
grant execute on function public.ensure_my_store() to authenticated;

revoke all on function public.accept_store_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_store_invite(uuid) to authenticated;

revoke all on function public.create_store_invite(uuid, text) from public, anon;
grant execute on function public.create_store_invite(uuid, text) to authenticated;

revoke all on function public.get_my_store() from public, anon;
grant execute on function public.get_my_store() to authenticated;

revoke all on function public.get_my_stores() from public, anon;
grant execute on function public.get_my_stores() to authenticated;

revoke all on function public.get_store_members(uuid) from public, anon;
grant execute on function public.get_store_members(uuid) to authenticated;

revoke all on function public.is_store_member(uuid) from public, anon;
grant execute on function public.is_store_member(uuid) to authenticated;
