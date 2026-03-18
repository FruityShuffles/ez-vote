-- Returns display names of all voters who have submitted a ballot for an election.
-- Only callable by the election owner or a joined voter.
create or replace function public.get_election_voters(p_election_id uuid)
returns table(display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1 from public.elections
      where id = p_election_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.election_voters
      where election_id = p_election_id and user_id = auth.uid()
    )
  ) then
    raise exception 'Not a participant';
  end if;

  return query
    select p.display_name
    from public.ballots b
    join public.profiles p on p.id = b.voter_id
    where b.election_id = p_election_id
    order by p.display_name;
end;
$$;
