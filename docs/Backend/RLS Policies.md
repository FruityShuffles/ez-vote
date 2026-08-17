# RLS Policies

Row-Level Security enforces access control at the database layer. Every table has RLS enabled. Policies are defined in migration 002 and extended by later migrations.

> **As of Oct 30, 2026**, RLS alone no longer exposes a table through the Data API — each new table in `public` also needs explicit `GRANT` statements per role. See [Schema.md → Data API Access & Grants](Schema.md#data-api-access--grants) for the table-creation template. The seven tables that already exist keep their current grants and are unaffected.

## The Core Access Question

For most tables, the access question is: **is this user an owner or a participant?**

- **Owner:** `elections.owner_id = auth.uid()`
- **Participant (open election):** has a row in `election_voters` for this election
- **Participant (invite-only):** has an accepted row in `invites` for this election

All elections currently use `invite_mode = 'open'`, so "participant" means `election_voters` membership.

## Helper Functions

These security-definer functions avoid RLS infinite recursion when checking ownership/membership inside policies:

### `current_user_owns_election(election_id uuid) → boolean`
Returns true if `auth.uid()` is the owner of the given election. Security-definer means it runs as the function owner (bypassing RLS on `elections`), avoiding the recursive loop that would occur if an `elections` policy called a function that itself queries `elections`.

### `election_allows_voter_candidates(election_id uuid) → boolean`
Returns the `allow_voter_candidates` flag for the election. Also security-definer for the same reason.

### `election_has_public_ballots(election_id uuid) → boolean`
Returns the `public_ballots` flag for the election. Used by the ballots SELECT policy to gate cross-voter visibility, and by `flip_searches` for the same reason. Security-definer to avoid RLS recursion when a `ballots` policy reads `elections`.

### `election_is_public(election_id uuid) → boolean`
Returns whether `elections.visibility = 'public'`. Used by the anyone-can-read SELECT policies on `candidates` and `results` (the equivalent `elections` policy checks the column directly — same table, no recursion).

These were added in migration 006 after discovering that inline subqueries in policies caused RLS recursion on `elections`. The public-ballots helper was added in migration 020 and the visibility helper in 022, following the same pattern.

## Publicly Viewable Elections

Migration 022 adds a second answer to the core access question: an election with `visibility = 'public'` is readable by **anyone**, including the sessionless `anon` role — its row, candidates, results, and (since public elections opt into `public_ballots`) its ballots via `get_public_ballots()`. The public SELECT policies have no `to` clause, so they cover `anon` and `authenticated` alike; the legacy table grants already give both roles SELECT at the grant layer.

Users cannot create public elections: the owner INSERT and UPDATE policies on `elections` carry `WITH CHECK (... and visibility = 'private' and showcase = false)`, so the only writer that can set either flag is the service role (which bypasses RLS). A deliberate consequence is that owners cannot modify a public election through the API at all.

## Per-Table Policies

### `profiles`
- **SELECT:** User reads own profile only (`id = auth.uid()`)
- **UPDATE:** User updates own profile only

No public profile reads — voters see display names via RPC functions that aggregate them, not direct table access.

### `elections`
- **SELECT:** Owner reads own elections; participants read elections they've joined; anyone (incl. `anon`) reads rows with `visibility = 'public'`
- **INSERT:** Owner only, and only with `visibility = 'private'` and `showcase = false`
- **UPDATE:** Owner only; `WITH CHECK` requires `visibility = 'private'` and `showcase = false`, so owners can never set the flags (and cannot modify a public election)
- **DELETE:** Owner only

### `candidates`
- **SELECT:** Owner reads; participants in the election read; anyone reads if `election_is_public()` returns true
- **INSERT:** Owner inserts; voters can insert if `election_allows_voter_candidates()` returns true
- **UPDATE:** No policy — the app never updates candidates (it deletes and reinserts)
- **DELETE:** Owner only

The voter-insert case powers ad-hoc candidate addition (the `allowVoterCandidates` feature).

### `invites`
- **SELECT:** Owner sees all invites for their elections; invitees see their own invite by email match
- **INSERT:** Owner only
- **UPDATE:** Via `accept_invite()` RPC only (security-definer)
- **DELETE:** Owner only

### `ballots`
- **SELECT:** Voter reads own ballot. When `elections.public_ballots = true`, the owner and joined voters can also read every ballot in that election.
- **INSERT/UPDATE:** Voter writes own ballot only; enforced by voter_id = auth.uid() check

Voter privacy: with `public_ballots = false`, no participant — including the owner — can SELECT another voter's ballot. The only paths to read another voter's ballot are (a) the `compute-results` edge function, which uses the service-role key to bypass RLS, and (b) the public-ballots opt-in. The legacy "Owners can read ballots" policy was dropped in migration 020 because it widened the privacy ceiling without being load-bearing for compute (compute already uses service-role).

### `results`
- **SELECT:** Owner reads; participants in the election read; anyone reads if `election_is_public()` returns true
- **INSERT/UPDATE:** Via edge function only (service role key, bypasses RLS)

### `flip_searches`
- **SELECT:** `election_has_public_ballots()` **and** (election is public, or caller owns it, or caller has joined it)
- **INSERT/UPDATE/DELETE:** no policies at all. `compute-results` and the case-study seed script write with the service-role key, which bypasses RLS.

**Why this gate and not the `results` one.** `result` embeds whole ballot payloads — each reported change is a named voter's own ranking with the target candidate promoted. So the correct precedent is the *ballots* read set, not the looser `results` set (which also admits invite-accepted users and does not require `public_ballots`). The policy is `get_public_ballots()`'s gate restated as RLS, which means the table exposes nothing a caller could not already read through that RPC.

**Migration 024 added `strategy` and no policy.** RLS in Postgres is row-level: one policy covers every column of the row, present and future. That is safe here rather than merely convenient, because the new column needs *exactly* the same gate — `strategy` embeds whole ballot payloads for the same reason `result` does (each reported opportunity is a named voter's own ballot with one method's key rewritten). A column whose sensitivity differed from the row's would need its own table, not a looser reading of this policy.

The absence of write policies is deliberate and load-bearing, unlike the legacy `"Owners can insert/update results"` pair: `simulate-counterfactual` holds no service-role key and must never gain one, so there is no path by which a read-only endpoint could write here.

### `election_voters`
- **SELECT:** Owner reads all voters for their elections; voter reads own membership row
- **INSERT:** Via `join_election()` RPC only (security-definer, enforces open invite_mode check)
- **DELETE:** None (membership is permanent once joined)

## Why Security-Definer RPCs

Several write operations go through security-definer RPC functions rather than direct table INSERT:

- `join_election()` — validates that the election exists, is open, and has `invite_mode = 'open'` before inserting into `election_voters`. Doing this check inside an RLS policy would cause recursion.
- `accept_invite()` — validates token, sets accepted_by and accepted_at atomically.
- `delete_current_user()` — needs to delete across multiple tables including `auth.users`, which requires elevated privileges.

Direct table writes are prevented by the RLS policies — these RPCs are the only path in.
