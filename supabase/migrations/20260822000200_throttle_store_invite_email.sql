create index if not exists store_invites_inviter_created_idx
  on public.store_invites (inviter_id, created_at desc);

create index if not exists store_invites_recipient_created_idx
  on public.store_invites (store_id, lower(invitee_email), created_at desc);

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

  if exists (
    select 1 from public.store_invites si
    where si.inviter_id = (select auth.uid())
      and si.store_id = p_store_id
      and lower(si.invitee_email) = v_email
      and si.created_at > now() - interval '1 minute'
  ) then
    raise exception 'Ижил хаяг руу дахин урихын өмнө 1 минут хүлээнэ үү.';
  end if;

  if (
    select count(*) from public.store_invites si
    where si.inviter_id = (select auth.uid())
      and si.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Нэг цагийн урилгын хязгаарт хүрлээ.';
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

revoke all on function public.create_store_invite(uuid, text) from public, anon;
grant execute on function public.create_store_invite(uuid, text) to authenticated;
