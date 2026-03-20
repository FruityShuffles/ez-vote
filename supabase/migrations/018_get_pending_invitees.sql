-- Returns display names of users in election_voters who haven't submitted a ballot
create or replace function get_pending_invitees(p_election_id uuid)
returns table (display_name text) as $$
begin
  return query
    select p.display_name
    from election_voters ev
    join profiles p on p.id = ev.user_id
    where ev.election_id = p_election_id
      and not exists (
        select 1 from ballots b
        where b.election_id = p_election_id
          and b.voter_id = ev.user_id
      )
    order by p.display_name;
end;
$$ language plpgsql security definer;
