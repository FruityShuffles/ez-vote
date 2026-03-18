-- Returns prior co-voters (users who voted in any election owned by the caller),
-- with how many elections they shared, excluding anyone already in the target election.
create or replace function public.get_prior_covoters(p_election_id uuid)
returns table(user_id uuid, display_name text, election_count int)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    p.display_name,
    count(distinct b.election_id)::int as election_count
  from public.ballots b
  join public.profiles p on p.id = b.voter_id
  join public.elections e on e.id = b.election_id
  where e.owner_id = auth.uid()
    and b.voter_id != auth.uid()
    and not exists (
      select 1 from public.election_voters ev
      where ev.election_id = p_election_id
        and ev.user_id = b.voter_id
    )
  group by p.id, p.display_name
  order by election_count desc, p.display_name;
$$;

-- Allows the election owner to directly add a voter to election_voters.
create or replace function public.add_voter_to_election(
  p_election_id uuid,
  p_voter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.elections
    where id = p_election_id and owner_id = auth.uid()
  ) then
    raise exception 'Not the election owner';
  end if;

  insert into public.election_voters (election_id, user_id)
  values (p_election_id, p_voter_id)
  on conflict (election_id, user_id) do nothing;
end;
$$;

-- Returns open elections where the caller is in election_voters but has not yet voted.
create or replace function public.get_pending_invitations()
returns setof public.elections
language sql
security definer
stable
set search_path = public
as $$
  select e.*
  from public.election_voters ev
  join public.elections e on e.id = ev.election_id
  where ev.user_id = auth.uid()
    and e.status = 'open'
    and not exists (
      select 1 from public.ballots b
      where b.election_id = ev.election_id
        and b.voter_id = auth.uid()
    )
  order by ev.joined_at desc;
$$;
