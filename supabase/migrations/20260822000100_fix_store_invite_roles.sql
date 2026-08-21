alter table public.store_invites
  drop constraint if exists store_invites_role_check;

update public.store_invites
set role = 'staff'
where role = 'member';

alter table public.store_invites
  alter column role set default 'staff';

alter table public.store_invites
  add constraint store_invites_role_check
  check (role in ('manager', 'staff'));

create or replace function public.create_store_invite(p_store_id uuid, p_email text)
returns public.store_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.store_invites;
  v_email text := lower(trim(p_email));
begin
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = (select auth.uid())
      and sm.role = 'owner'
  ) then
    raise exception 'Only the store owner can invite members';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  if exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) = v_email
  ) then
    raise exception 'You are already the owner of this store';
  end if;

  if exists (
    select 1
    from public.store_members sm
    join auth.users u on u.id = sm.user_id
    where sm.store_id = p_store_id
      and lower(u.email) = v_email
  ) then
    raise exception 'This user is already a store member';
  end if;

  update public.store_invites
     set status = 'revoked'
   where store_id = p_store_id
     and lower(invitee_email) = v_email
     and status = 'pending';

  insert into public.store_invites(store_id, inviter_id, invitee_email, role)
  values (p_store_id, (select auth.uid()), v_email, 'staff')
  returning * into v_invite;

  return v_invite;
end;
$$;

create or replace function public.accept_store_invite(p_token uuid)
returns public.store_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.store_invites;
  v_member public.store_members;
  v_email text;
  v_role text;
begin
  select * into v_invite
  from public.store_invites
  where token = p_token
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found or no longer active';
  end if;

  if v_invite.expires_at < now() then
    update public.store_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Invite has expired';
  end if;

  select lower(email) into v_email from auth.users where id = (select auth.uid());
  if v_email is null or v_email <> lower(v_invite.invitee_email) then
    raise exception 'This invite is for a different email address';
  end if;

  v_role := case when v_invite.role = 'manager' then 'manager' else 'staff' end;

  insert into public.store_members(store_id, user_id, role)
  values (v_invite.store_id, (select auth.uid()), v_role)
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

revoke all on function public.create_store_invite(uuid, text) from public, anon;
revoke all on function public.accept_store_invite(uuid) from public, anon;
grant execute on function public.create_store_invite(uuid, text) to authenticated;
grant execute on function public.accept_store_invite(uuid) to authenticated;
