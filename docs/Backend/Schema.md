# Database Schema

Supabase (PostgreSQL). Migrations in `supabase/migrations/` — deploy with `supabase db push`.

## Core Tables

### `profiles`
Mirror of `auth.users` for app-level user data. Created by trigger on auth confirmation.

| Column | Type | Notes |
|---|---|---|
| id | uuid | FK → auth.users.id, PK |
| email | text | Not null |
| display_name | text | Nullable |
| created_at | timestamptz | Default now() |

### `elections`
Central entity. One row per election.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| owner_id | uuid | FK → profiles.id |
| title | text | Not null |
| description | text | Nullable |
| status | text | `'open'` or `'closed'` |
| algorithms | text[] | e.g. `['irv', 'star', 'approval']` |
| invite_mode | text | `'open'` (default); future: `'invite_only'` |
| allow_voter_candidates | boolean | Default false |
| realtime_results | boolean | Default false |
| include_fptp | boolean | Default true |
| public_ballots | boolean | Default false. When true, all participants can view all submitted ballots. |
| visibility | text | `'private'` (default) or `'public'`. Public elections are readable by anyone, including the `anon` role. Only the service role can set it — owner write policies require `'private'`. |
| showcase | boolean | Default false. Marks the curated Case Studies subset of public elections. Service-role-only, like `visibility`. Seeded rows carry deterministic ids derived from a fixture slug — see [[Features/Case Studies]]. |
| candidates_updated_at | timestamptz | Bumped by trigger on candidate insert |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `candidates`
Ordered list of candidates per election.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| name | text | Not null |
| position | int | Sort order |
| created_at | timestamptz | |

**Constraint:** `idx_candidates_unique_name_per_election` — unique (election_id, name). Prevents duplicate candidate names within an election.

**Trigger:** On candidate insert, bumps `elections.candidates_updated_at`. Used for polling-based staleness detection.

### `ballots`
One row per (voter, election) pair. Stores full voting payload.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| voter_id | uuid | FK → profiles.id; nullable (nullified on account delete) |
| payload | jsonb | Full ballot data (see payload structure below) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Constraint:** unique(election_id, voter_id). One ballot per voter per election. Resubmission is an upsert.

### `results`
Computed voting results. One row per (election, algorithm) pair.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| algorithm | text | `'irv'`, `'star'`, `'approval'`, `'fptp'` |
| result_data | jsonb | Algorithm-specific result object |
| created_at | timestamptz | |
| updated_at | timestamptz | Used for realtime polling freshness |

**Constraint:** unique(election_id, algorithm). Edge function upserts.

### `flip_searches`
Both counterfactual analyses precomputed when an election closes ([[Features/Counterfactual Explorer]], [[Features/Strategic Voting]]). One row per election, so the FK is the primary key — there is no surrogate `id`, unlike every other table here.

**The name is narrower than the contents**, deliberately. Since migration 024 the row also holds the strategic voting search. Both are precomputed counterfactual analyses of the same election, keyed the same way, gated the same way, written by the same two service-role callers, and read together by the same explorer page — a second table would mean a second round trip for one screen and a second copy of the policy to keep in step. Renaming was judged not worth an already-deployed table.

| Column | Type | Notes |
|---|---|---|
| election_id | uuid | FK → elections.id, PK, `on delete cascade` |
| result | jsonb, **nullable** | A `FlipSearchResult` verbatim — the same JSON `simulate-counterfactual` returns under `find_flip`. Null when the election is not tabulated with IRV |
| strategy | jsonb, nullable | A `StrategicSearchResult` verbatim — the same JSON returned under `find_strategy` (migration 024). Null when the input caps rule the search out |
| computed_at | timestamptz | Default now(). Operator visibility only; nothing reads it for freshness |

**Why `result` is nullable.** The two searches have different eligibility: the flip search requires IRV, the strategic search runs on any tabulated election. An approval-only election therefore has a strategy answer and no flip answer and must still get a row. A row with **both** columns null is meaningless and is deleted rather than stored.

**No freshness check, by construction.** Both ballot write policies require `elections.status = 'open'`, so a closed election's ballots are immutable and a stored search can never disagree with a fresh one.

The client reads this row with `select('*')` rather than naming columns, so a database behind on migrations degrades to a missing field instead of a query error that would take the other answer down with it.

**Writers:** `compute-results` (on close) and the case-study seed script, both on the service role. There are deliberately no INSERT/UPDATE/DELETE policies — see [[Backend/RLS Policies]] for why the read gate mirrors `ballots` rather than `results`.

### `invites`
Email invite records. Currently used for the future invite-only flow.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| email | text | Invitee email |
| token | uuid | Unique per invite; used in accept URL |
| accepted_by | uuid | FK → profiles.id; set on acceptance |
| accepted_at | timestamptz | |
| created_at | timestamptz | |

### `election_voters`
Tracks who has joined an open election. Populated via `join_election()` RPC.

| Column | Type | Notes |
|---|---|---|
| election_id | uuid | FK → elections.id |
| user_id | uuid | FK → profiles.id. Named `user_id`, not `voter_id` — unlike `ballots`. |
| joined_at | timestamptz | |

**Constraint:** primary key (election_id, user_id). Join is idempotent.

## Ballot Payload Structure

Stored in `ballots.payload` (JSONB). Keys present depend on which algorithms the election uses:

```json
{
  "star": { "candidate-uuid-1": 5, "candidate-uuid-2": 3 },
  "irv": ["candidate-uuid-1", "candidate-uuid-3", "candidate-uuid-2"],
  "approval": ["candidate-uuid-1", "candidate-uuid-3"],
  "fptp": "candidate-uuid-1"
}
```

Derived fields (IRV from STAR scores, approval from cutoff/top-K) are computed client-side before submission. The edge function receives the final derived values — it does not re-derive anything.

## Migration History

| Migration | Key changes                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| 001       | Initial schema: profiles, elections, candidates, invites, ballots, results                      |
| 002       | RLS policies                                                                                    |
| 003       | RPC functions: accept_invite, get_ballot_count, etc.                                            |
| 004       | Unique constraint on candidate names per election                                               |
| 005       | `invite_mode` column, `election_voters` table, `join_election()` RPC                            |
| 006       | `current_user_owns_election()` security-definer fn (breaks RLS recursion)                       |
| 007       | `on_auth_user_confirmed` trigger — fires on UPDATE when `email_confirmed_at` goes null→non-null (email/OTP flow) → calls `handle_new_user()` to upsert profile |
| 008–012   | Incremental feature additions                                                                   |
| 009       | Adds `on_auth_user_created` trigger — fires on INSERT when `email_confirmed_at IS NOT NULL` (Google OAuth, pre-confirmed). Both 007 and 009 call `handle_new_user()`. The `ON CONFLICT (id) DO NOTHING` in that function is load-bearing — do not remove it. |
| 011       | pg_cron job: delete elections older than 60 days at 3 AM daily                                  |
| 013       | `allow_voter_candidates`, `realtime_results`, `candidates_updated_at`; candidate insert trigger |
| 014       | `updated_at` on results table (for realtime polling freshness)                                  |
| 015–016   | Additional RPC functions (election voters, prior covoters, invitations)                        |
| 017       | `include_fptp` flag on elections                                                                |
| 018       | `get_pending_invitees()` RPC                                                                    |
| 019       | `bump_ballots_updated_at` trigger so realtime polling reacts to ballot edits                    |
| 020       | `public_ballots` flag, drops legacy "Owners can read ballots" policy, adds public-ballots RLS + `get_public_ballots()` RPC |
| 021       | Tightens `get_public_ballots()` to require `public_ballots = true` for *all* callers (including the owner)             |
| 022       | Publicly viewable elections: `visibility` + `showcase` columns, `election_is_public()` helper, anyone-can-read policies on elections/candidates/results, owner write policies locked to private, anon-capable `get_public_ballots()`, gated `get_pending_invitees()`, cron purge excludes public elections |
| 023       | `flip_searches` table for the flip search precomputed at close (#146); the first table carrying explicit Data API grants |
| 024       | `flip_searches.strategy` for the strategic voting search precomputed at close (#149); makes `result` nullable, since the two searches have different eligibility. No new policy — RLS is row-level, so 023's gate already covers the column |

## Data API Access & Grants

Supabase is changing how `public`-schema tables are exposed to the Data API (PostgREST, supabase-js, GraphQL):

- **May 30, 2026** — new projects no longer auto-grant access to tables in `public`.
- **October 30, 2026** — same enforcement extends to all existing projects, including this one (created Feb 18, 2026).

After enforcement, a table without explicit role grants is unreachable through the REST API and PostgREST returns error `42501` with the exact missing `GRANT` statement. **RLS is still required but is no longer sufficient on its own.**

**Existing tables are unaffected.** Per Supabase's announcement, existing tables keep their current grants. The seven tables already in `public` (`profiles`, `elections`, `candidates`, `invites`, `ballots`, `results`, `election_voters`) need no backfill migration.

`flip_searches` (migration 023) is the first table added since, and follows the template below: `select` to `anon` and `authenticated`, everything to `service_role`. A missed grant here fails silently rather than loudly — the client's stored-flip read degrades to the live search — so the grants are worth checking directly after any environment rebuild.

**New tables must include explicit grants.** Use this template when adding a table in `public`:

```sql
create table public.foo (
  -- columns...
);

alter table public.foo enable row level security;

-- Grant Data API access per role. Tailor to actual needs:
--   anon: usually nothing, or `select` for public-readable tables only.
--   authenticated: covers client (supabase-js) reads/writes.
--   service_role: covers the edge function and any server-side bypass.
grant select on public.foo to anon;
grant select, insert, update, delete on public.foo to authenticated;
grant select, insert, update, delete on public.foo to service_role;

-- Then RLS policies (see RLS Policies.md)
create policy "..." on public.foo for select to authenticated using (...);
```

The grants determine *which verbs are reachable through the API*; RLS policies determine *which rows each authenticated caller may touch*. Both layers are needed.

If you see `42501` from PostgREST in a deployed environment, the error body contains the precise grant statement to add — copy it into a new migration rather than guessing.
