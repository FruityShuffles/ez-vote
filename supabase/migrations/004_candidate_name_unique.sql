-- Enforce unique candidate names (case-insensitive) within an election.
create unique index if not exists idx_candidates_unique_name_per_election
  on public.candidates (election_id, lower(name));
