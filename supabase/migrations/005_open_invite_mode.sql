-- ── invite_mode on elections ─────────────────────────────────────────────────
-- 'open'         – anyone with the join link can vote
-- 'invite_only'  – owner sends per-person email invites (UI hidden for now)
alter table public.elections
  add column if not exists invite_mode text not null default 'open'
    check (invite_mode in ('open', 'invite_only'));

-- ── election_voters ───────────────────────────────────────────────────────────
-- Tracks authenticated users who have joined an open election.
create table if not exists public.election_voters (
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (election_id, user_id)
);

create index if not exists idx_election_voters_election
  on public.election_voters(election_id);
create index if not exists idx_election_voters_user
  on public.election_voters(user_id);

alter table public.election_voters enable row level security;

-- Users can read their own membership rows
create policy "Users can read own election_voters rows"
  on public.election_voters for select
  using (user_id = auth.uid());

-- Owners can read all voter rows for their elections
create policy "Owners can read election_voters for their elections"
  on public.election_voters for select
  using (
    exists (
      select 1 from public.elections
      where elections.id = election_voters.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- ── join_election RPC ─────────────────────────────────────────────────────────
-- Inserts a row into election_voters for the calling user.
-- Validates: election exists, is open, and invite_mode is 'open'.
-- Idempotent: silently succeeds if the user has already joined.
create or replace function public.join_election(p_election_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_election record;
begin
  select * into v_election
  from public.elections
  where id = p_election_id;

  if not found then
    raise exception 'Election not found';
  end if;

  if v_election.status != 'open' then
    raise exception 'Election is not open';
  end if;

  if v_election.invite_mode != 'open' then
    raise exception 'This election requires a personal invite';
  end if;

  insert into public.election_voters (election_id, user_id)
  values (p_election_id, auth.uid())
  on conflict (election_id, user_id) do nothing;
end;
$$;

-- ── Updated RLS policies ──────────────────────────────────────────────────────
-- All existing policies that check invites.accepted_by are extended to also
-- accept election_voters membership, so both flows work side-by-side.

-- Helper: is the current user a voter for this election?
-- (either via old invite-accept or new election_voters join)
-- Used inline in each policy below.

-- ELECTIONS: voters via election_voters can read
create policy "Joined voters can read elections"
  on public.elections for select
  using (
    exists (
      select 1 from public.election_voters
      where election_voters.election_id = elections.id
        and election_voters.user_id = auth.uid()
    )
  );

-- CANDIDATES: voters via election_voters can read
create policy "Joined voters can read candidates"
  on public.candidates for select
  using (
    exists (
      select 1 from public.election_voters ev
      where ev.election_id = candidates.election_id
        and ev.user_id = auth.uid()
    )
  );

-- BALLOTS: voters via election_voters can insert
create policy "Joined voters can insert ballots"
  on public.ballots for insert
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.elections
      where elections.id = ballots.election_id
        and elections.status = 'open'
    )
    and exists (
      select 1 from public.election_voters ev
      where ev.election_id = ballots.election_id
        and ev.user_id = auth.uid()
    )
  );

-- RESULTS: voters via election_voters can read
create policy "Joined voters can read results"
  on public.results for select
  using (
    exists (
      select 1 from public.election_voters ev
      where ev.election_id = results.election_id
        and ev.user_id = auth.uid()
    )
  );
