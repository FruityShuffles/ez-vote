create or replace function public.get_ballot_count(p_election_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.ballots where election_id = p_election_id;
$$;
