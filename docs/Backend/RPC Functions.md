# RPC Functions

Postgres functions callable from the client via `supabase.rpc('function_name', { ...params })`. All are defined in migrations 003+.

## User-Callable RPCs

### `join_election(p_election_id uuid)`
**Called by:** `ElectionRepository.joinElection()` → `JoinElectionScreen`

Adds the current user to `election_voters` for the given election. Idempotent — safe to call if already joined.

Validates:
- Election exists
- Election status is `'open'`
- `invite_mode = 'open'` (invite-only elections would require `accept_invite` instead)

Security-definer to bypass the RLS recursion that would occur if the policy itself checked election ownership.

---

### `accept_invite(p_token uuid)`
**Called by:** `InviteRepository.acceptInvite()` (invite-only flow, currently deferred)

Finds the invite row matching the token, sets `accepted_by = auth.uid()` and `accepted_at = now()`, then inserts the user into `election_voters`.

Validates:
- Token exists and hasn't been accepted yet

---

### `get_ballot_count(p_election_id uuid) → integer`
**Called by:** `BallotRepository.getBallotCount()` → `ballotCountProvider`

Returns count of ballots for the election. Security-definer so both owners and participants can call it without needing ballot SELECT access beyond their own row. Has no access check at all — any caller who knows an election id (including `anon`) gets the count. Audited for #140 and left as is: a bare integer discloses nothing sensitive, and public election pages will need it.

---

### `get_election_voters(p_election_id uuid) → table(display_name text)`
**Called by:** `BallotRepository.getVoterNames()` → `electionVotersProvider`

Returns display names of all users in `election_voters` for the election. Aggregates names from `profiles` without exposing raw voter IDs. Gated: raises `Not a participant` unless the caller is the owner or a joined voter (NULL-safe, so `anon` is rejected). Public elections do **not** get a carve-out here — voter names stay participant-only; the UI slice of #139 must hide the voter list on public elections.

---

### `get_prior_covoters(p_election_id uuid) → table(voter_id uuid, display_name text, email text)`
**Called by:** `BallotRepository.getPriorCovoters()` → `priorCovotersProvider`

Returns users who have voted in other elections alongside the current user, excluding those already in this election. Used in `InviteVotersScreen` to suggest re-inviting familiar voters.

---

### `get_pending_invitees(p_election_id uuid) → table(display_name text)`
**Called by:** `BallotRepository.getPendingInvitees()` → `pendingInviteesProvider`

Returns display names of joined voters who haven't submitted a ballot yet. Displayed in `ElectionDetailScreen` as the "pending" count.

The migration 018 version had no access check (any caller, even `anon`, could list names for any election id) — found during the #140 audit and fixed in migration 022 with the same owner-or-joined-voter gate as `get_election_voters`. Like the voter list, this stays participant-only on public elections.

---

### `get_public_ballots(p_election_id uuid) → table(voter_id uuid, display_name text, payload jsonb, updated_at timestamptz)`
**Called by:** `BallotRepository.getPublicBallots()` → `publicBallotsProvider`

Returns every submitted ballot for the election alongside the voter's display name. Requires `elections.public_ballots = true` (enforced for all callers, owner included). On private elections the caller must additionally be the owner or a joined voter; on `visibility = 'public'` elections that check is skipped, so anyone — including `anon` — can read the ballots. Errors with `Election not found`, `Public ballots not enabled`, or `Not a participant` otherwise. Security-definer so it can join `profiles` without exposing the table to direct reads.

Added in migration 020 alongside the public-ballots feature; migration 021 tightened the flag check so owners do not bypass it; migration 022 added the public-election path and made the participant gate NULL-safe (the 021 version's `auth.uid() <> owner` comparison evaluated to NULL for anonymous callers, silently skipping the gate).

---

### `get_pending_invitations() → table(election_id uuid, ...)`
**Called by:** `ElectionRepository.listPendingInvitations()` → `pendingInvitationsProvider`

Returns open elections where the current user has been invited but hasn't yet accepted/joined. Drives the "Invited" section on the home screen.

---

### `delete_current_user()`
**Called by:** `AuthRepository.deleteAccount()` → `SettingsScreen`

Cascading account deletion:
1. Sets `voter_id = null` on all ballots (preserves ballot data for result integrity, but anonymizes it)
2. Deletes rows from `election_voters`
3. Deletes the `profiles` row
4. Calls `auth.users` delete (requires service-role privilege — this is why it's security-definer)

---

## Auth Triggers (not RPCs but closely related)

### `handle_new_user()`
Called by two triggers:
- `on_auth_user_confirmed` — fires after email OTP verification
- `on_auth_user_created` — fires after OAuth (Google) user creation

Upserts a row into `profiles`:
```sql
INSERT INTO profiles (id, email, display_name)
VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
ON CONFLICT DO NOTHING;
```

The `ON CONFLICT DO NOTHING` makes it idempotent — if both triggers fire (edge case), the second insert is a no-op.
