-- Migration 010: account deletion support
-- Allow closed-election ballots to be anonymized (voter_id → NULL) on profile delete.
-- Allow invites.accepted_by to be cleared (→ NULL) on profile delete.

-- 1. Make ballots.voter_id nullable and switch to SET NULL on delete.
alter table public.ballots alter column voter_id drop not null;

alter table public.ballots drop constraint ballots_voter_id_fkey;
alter table public.ballots add constraint ballots_voter_id_fkey
  foreign key (voter_id) references public.profiles(id) on delete set null;

-- 2. Switch invites.accepted_by to SET NULL on delete.
alter table public.invites drop constraint invites_accepted_by_fkey;
alter table public.invites add constraint invites_accepted_by_fkey
  foreign key (accepted_by) references public.profiles(id) on delete set null;

-- 3. RPC: delete the calling user's account.
--    Steps:
--      a. Delete ballots cast by this user in draft/open elections (not yet closed).
--      b. Delete the profile row; cascades:
--           - owned elections → candidates, results, invites, their ballots (CASCADE)
--           - remaining closed-election ballots: voter_id → NULL  (SET NULL)
--           - invites.accepted_by → NULL                          (SET NULL)
--      c. Delete the auth.users row (requires security definer running as postgres).
create or replace function public.delete_current_user()
returns void language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  -- Remove active ballots so the user's votes in ongoing elections disappear cleanly.
  delete from public.ballots
  where voter_id = uid
    and election_id in (
      select id from public.elections where status in ('draft', 'open')
    );

  -- Deleting the profile cascades to owned elections and anonymizes remaining ballots.
  delete from public.profiles where id = uid;

  -- Finally remove the auth record (only possible via security definer / postgres role).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;
