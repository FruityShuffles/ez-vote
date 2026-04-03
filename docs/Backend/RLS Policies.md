# RLS Policies

Row-Level Security enforces access control at the database layer. Every table has RLS enabled. Policies are defined in migration 002 and extended by later migrations.

## The Core Access Question

For most tables, the access question is: **is this user an owner or a participant?**

- **Owner:** `elections.owner_id = auth.uid()`
- **Participant (open election):** has a row in `election_voters` for this election
- **Participant (invite-only):** has an accepted row in `invites` for this election

All elections currently use `invite_mode = 'open'`, so "participant" means `election_voters` membership.

## Helper Functions

Two security-definer functions avoid RLS infinite recursion when checking ownership/membership inside policies:

### `current_user_owns_election(election_id uuid) → boolean`
Returns true if `auth.uid()` is the owner of the given election. Security-definer means it runs as the function owner (bypassing RLS on `elections`), avoiding the recursive loop that would occur if an `elections` policy called a function that itself queries `elections`.

### `election_allows_voter_candidates(election_id uuid) → boolean`
Returns the `allow_voter_candidates` flag for the election. Also security-definer for the same reason.

These were added in migration 006 after discovering that inline subqueries in policies caused RLS recursion on `elections`.

## Per-Table Policies

### `profiles`
- **SELECT:** User reads own profile only (`id = auth.uid()`)
- **UPDATE:** User updates own profile only

No public profile reads — voters see display names via RPC functions that aggregate them, not direct table access.

### `elections`
- **SELECT:** Owner reads own elections; participants read elections they've joined
- **INSERT:** Authenticated users only (owner_id auto-set)
- **UPDATE:** Owner only
- **DELETE:** Owner only

### `candidates`
- **SELECT:** Owner reads; participants in the election read
- **INSERT:** Owner inserts; voters can insert if `election_allows_voter_candidates()` returns true
- **UPDATE:** Owner only
- **DELETE:** Owner only

The voter-insert case powers ad-hoc candidate addition (the `allowVoterCandidates` feature).

### `invites`
- **SELECT:** Owner sees all invites for their elections; invitees see their own invite by email match
- **INSERT:** Owner only
- **UPDATE:** Via `accept_invite()` RPC only (security-definer)
- **DELETE:** Owner only

### `ballots`
- **SELECT:** Voter reads own ballot; owner reads all ballots for their elections (needed for result computation)
- **INSERT/UPDATE:** Voter writes own ballot only; enforced by voter_id = auth.uid() check

Voter privacy: voters cannot read each other's ballots. The edge function runs as service role and bypasses RLS entirely.

### `results`
- **SELECT:** Owner reads; participants in the election read
- **INSERT/UPDATE:** Via edge function only (service role key, bypasses RLS)

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
