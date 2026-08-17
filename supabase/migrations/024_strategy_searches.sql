-- Precomputed strategic voting searches (issue #149).
--
-- The strategic voting search — "could this voter have gotten a better outcome
-- by voting differently?", asked per method — is the individual-voter
-- counterpart to the flip search's electorate-wide question. Same economics:
-- a pure function of an election's candidates and ballots, and a closed
-- election's ballots can never change again (both ballot write policies in
-- migration 002 require status = 'open'), so it is computed once at close and
-- read forever after.
--
-- It lands as a COLUMN on flip_searches rather than a table of its own. Both
-- are precomputed counterfactual analyses of the same election, keyed the same
-- way, gated the same way, written by the same two service-role callers, and
-- read together by the same explorer page — a second table would mean a second
-- round trip for one screen and a second copy of the policy below to keep in
-- step. The table's name is now narrower than its contents; the trade is
-- deliberate.
--
-- `result` becomes nullable because the two searches have different
-- eligibility: the flip search requires IRV, the strategic search runs on any
-- tabulated election. An approval-only election therefore has a strategy answer
-- and no flip answer, and must still get a row. A row with both columns null is
-- meaningless and is deleted rather than stored — see scripts/seed-case-studies.ts.
--
-- PRIVACY, LOAD-BEARING: `strategy` embeds whole ballot payloads for exactly
-- the same reason `result` does — each reported opportunity is a named voter's
-- own ballot with one method's key rewritten. The existing policy is therefore
-- already the correct gate for it, unchanged: public_ballots must be on, and
-- the caller must own the election, have joined it, or be any caller at all
-- when the election is public. That is what get_public_ballots() enforces
-- (migrations 020/021/022), so this column exposes nothing the caller could not
-- already read. RLS in Postgres is row-level, so the policy covers every column
-- of the row and no new policy is needed.
--
-- Writers are unchanged and still service-role only: compute-results and the
-- case-study seed script. There are deliberately no INSERT/UPDATE/DELETE
-- policies. simulate-counterfactual holds no service-role key and must never
-- gain one — see the header of its index.ts.

alter table public.flip_searches
  add column strategy jsonb;

alter table public.flip_searches
  alter column result drop not null;

comment on table public.flip_searches is
  'Precomputed counterfactual analyses for a closed election: the IRV flip '
  'search (result, #146) and the per-method strategic voting search '
  '(strategy, #149). Either column may be null when that search does not '
  'apply; a row with both null is deleted rather than stored.';
