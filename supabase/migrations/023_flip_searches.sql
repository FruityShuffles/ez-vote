-- Precomputed IRV flip searches (issue #146).
--
-- The flip search — "what is the smallest set of ballot changes that would make
-- someone else the IRV winner?" — costs up to ~500 ms of edge CPU. Its answer is
-- a pure function of an election's candidates and ballots, and a closed
-- election's ballots can never change again (both ballot write policies in
-- migration 002 require status = 'open'), so it is computed once at close and
-- read from here forever after. There is deliberately no freshness check: there
-- is nothing that can make a stored row disagree with a fresh search.
--
-- simulate-counterfactual keeps its live `find_flip` path as the fallback for
-- elections with no row: those closed before this migration, and those whose
-- owner enabled public_ballots after closing.
--
-- No surrogate `id` column, unlike every other table here: there is exactly one
-- search per election, so the foreign key is the natural primary key.
--
-- PRIVACY, LOAD-BEARING: `result` embeds whole ballot payloads — each reported
-- change is a named voter's own ranking with the target candidate promoted. The
-- read gate is therefore the BALLOTS read set, not the looser `results` one:
-- public_ballots must be on, and the caller must own the election, have joined
-- it, or be any caller at all when the election is public. That is exactly the
-- gate get_public_ballots() applies (migrations 020/021/022), restated as RLS,
-- so this table exposes nothing the caller could not already read.
--
-- There are deliberately no INSERT/UPDATE/DELETE policies. The only writers are
-- compute-results and the case-study seed script, both on the service role,
-- which bypasses RLS. simulate-counterfactual holds no service-role key and
-- must never gain one — see the header of its index.ts.

create table public.flip_searches (
  election_id uuid primary key
    references public.elections(id) on delete cascade,
  result jsonb not null,
  computed_at timestamptz not null default now()
);

alter table public.flip_searches enable row level security;

-- Data API grants. Tables created in `public` after Supabase's enforcement date
-- get no implicit role grants, so RLS alone would leave this unreachable through
-- PostgREST — see docs/Backend/Schema.md, "Data API Access & Grants". This is
-- the first EZVote table that needs them. Read-only for both client roles;
-- every write path is service-role.
grant select on public.flip_searches to anon;
grant select on public.flip_searches to authenticated;
grant select, insert, update, delete on public.flip_searches to service_role;

-- No `to` clause, matching migration 022: covers anon and authenticated alike.
-- All three helpers are security-definer with a pinned search_path (006, 020,
-- 022), so none of this recurses into the elections policies.
create policy "Public-ballot viewers can read flip searches"
  on public.flip_searches for select
  using (
    public.election_has_public_ballots(election_id)
    and (
      public.election_is_public(election_id)
      or public.current_user_owns_election(election_id)
      or exists (
        select 1
          from public.election_voters ev
         where ev.election_id = flip_searches.election_id
           and ev.user_id = auth.uid()
      )
    )
  );
