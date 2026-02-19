-- accept_invite RPC function
-- Allows an authenticated user to accept an invite by token
create or replace function public.accept_invite(invite_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_invite record;
begin
  -- Find the invite by token
  select * into v_invite
  from public.invites
  where token = invite_token
    and accepted_by is null;

  if not found then
    raise exception 'Invalid or already-accepted invite token';
  end if;

  -- Mark the invite as accepted
  update public.invites
  set
    accepted_by = auth.uid(),
    accepted_at = now()
  where id = v_invite.id;
end;
$$;
