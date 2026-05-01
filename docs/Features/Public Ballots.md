# Public Ballots

**Flag:** `election.publicBallots = true`

When enabled, every participant in an election (the owner and all joined voters) can view the full payload of every other participant's submitted ballot from the results screen. Designed both as a transparency option and as the foundation for future counterfactual analysis ("smallest ballot change that flips the election").

## Owner-facing UX

- Toggle lives in the **Settings** section of `CreateElectionScreen` (next to *Allow voters to add candidates*, *Show real-time results*, *Include FPTP comparison*).
- Subtitle: *"Anyone in the election can see how each voter voted. Cannot be changed after the election opens."*
- Editing of an election is gated by `status == draft` in the existing UI flow (Edit button only appears for drafts), so the toggle is effectively locked once the election leaves draft.

## Voter-facing UX

The existing "N ballots submitted" row on `ElectionDetailScreen` opens a bottom sheet listing every voter who has submitted. When `publicBallots = true`, each row in that sheet has a **"View ballot"** button:

- Tap → push `/election/:id/ballot/:idx` with the ordered list of `PublicBallot` records as `extra`.
- The destination is `BallotScreen` rendered in `viewOnly` mode with `publicBallotIndex` / `publicBallots` set.
- The AppBar shows `"<voter name>'s ballot"` and `"<idx+1> of <total>"`.
- Left/right `chevron` arrows step through the ordered list. On narrow screens (`width < 600`) the arrows render as a fixed bottom row of `Previous` / `Next` buttons; on wider screens they sit pinned to the left/right edges of the body, vertically centred.
- Navigation uses `context.replace` so the back button returns to the voter list rather than walking back through visited ballots one at a time.
- A `ValueKey('public-ballot-<electionId>-<idx>')` on the destination screen forces a fresh `State` per ballot, so the existing `_initialized` guard in `BallotScreen` can stay as-is.

## Privacy guarantees

Before this feature, the `ballots` table had a legacy SELECT policy `"Owners can read ballots"` that let owners read every ballot in their elections directly via the table. The policy was vestigial: result computation runs in the `compute-results` edge function under the service-role key, which bypasses RLS entirely (`supabase/functions/compute-results/index.ts:352, 369`). Migration `020` drops that policy.

After migration 020, the SELECT policies on `ballots` are:

1. `Voters can read own ballots` — voter reads only their own row (`voter_id = auth.uid()`).
2. `Participants can read public ballots` — owner OR joined voter, gated on `public_ballots = true` for the parent election.

So the only paths that can read another voter's ballot are (a) the edge function (service-role bypass) and (b) the explicit public-ballots opt-in. With `public_ballots = false`, no other participant — including the owner — can SELECT another voter's ballot.

## Schema

Migration `supabase/migrations/020_public_ballots.sql`:

- Adds `elections.public_ballots boolean NOT NULL DEFAULT false`.
- Adds security-definer helper `election_has_public_ballots(p_election_id uuid)` to avoid RLS recursion (mirrors `election_allows_voter_candidates`).
- Adds the new SELECT policy on `ballots` and the `get_public_ballots` RPC.

## RPC

`get_public_ballots(p_election_id uuid)` returns `(voter_id, display_name, payload, updated_at)` rows, ordered by display name. It enforces:

- Election exists.
- `public_ballots = true` (applies to every caller, including the owner).
- Caller is the owner OR a member of `election_voters`.

Errors with `Election not found`, `Public ballots not enabled`, or `Not a participant` otherwise. Migration 021 tightened the flag check so the owner cannot bypass it.

The Flutter side calls it through `BallotRepository.getPublicBallots()` and exposes it via `publicBallotsProvider(electionId)`.

## Realtime polling integration

When `realtimeResults` is also enabled, `ElectionDetailScreen._poll()` invalidates `publicBallotsProvider` and `electionVotersProvider` on the same tick that triggers `resultsProvider` invalidation, so the ballot list stays fresh as new ballots come in.
