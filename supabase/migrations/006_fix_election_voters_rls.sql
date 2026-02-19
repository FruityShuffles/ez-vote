-- Fix infinite recursion: the "Joined voters can read elections" policy queries
-- election_voters, whose "Owners can read election_voters" policy queries
-- elections, which triggers elections RLS again → loop.
--
-- Solution: replace the election_voters owner policy with one that uses a
-- security definer function, which bypasses RLS when it queries elections.

create or replace function public.current_user_owns_election(p_election_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.elections
    where id = p_election_id
      and owner_id = auth.uid()
  );
$$;

drop policy if exists "Owners can read election_voters for their elections"
  on public.election_voters;

create policy "Owners can read election_voters for their elections"
  on public.election_voters for select
  using (public.current_user_owns_election(election_id));
