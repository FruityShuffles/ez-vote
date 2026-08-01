# Public Ballots

**Flag:** `election.publicBallots = true`

When enabled, every participant in an election (the owner and all joined voters) can view the full payload of every other participant's submitted ballot from the results screen. Designed both as a transparency option and as the foundation for future counterfactual analysis ("smallest ballot change that flips the election").

## Owner-facing UX

- Toggle lives in the **Settings** section of `CreateElectionScreen` (next to *Allow voters to add candidates*, *Show real-time results*, *Include FPTP comparison*).
- Subtitle: *"Anyone in the election can see how each voter voted."*
- Editing of an election is gated by `status == draft` in the existing UI flow (Edit button only appears for drafts), so the toggle is effectively locked once the election leaves draft.

## Voter-facing UX

The existing "N ballots submitted" row on `ElectionDetail` opens the URL-controlled `?voters=open` dialog listing every voter who has submitted. Opening pushes a history entry, so browser Back closes the dialog. When `publicBallots = true`, each row has a **"View ballot"** button:

- Tap → push `/election/:id/ballot/:idx` with `state.from = 'voters'`.
- `PublicBallot` fetches the ordered list again and renders the selected payload through `BallotView` in read-only mode.
- The screen shows `"<voter name>'s ballot"` and `"<idx+1> of <total>"`.
- Previous/Next replace the current ballot URL and re-stamp the origin marker, so paging never grows the history stack.
- The election breadcrumb uses numeric history only when that marker is present, reopening the voters dialog. A cold ballot deep link instead replaces to `/election/:id?voters=open`, so it always has an in-app back path.

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

The [[Backend/Simulate Counterfactual|simulate-counterfactual]] edge function (M20) reads ballots through this same RPC rather than reimplementing the checks, so counterfactual analysis inherits this gate exactly: it is available only on elections that opted into public ballots, and it exposes nothing a caller could not already see by paging through the ballot list. Since the flag is locked once an election leaves draft, elections that did not opt in are permanently ineligible.

The [[Features/Counterfactual Explorer]] (M21) is the flag's second consumer, and inherits this gate exactly.

## Ballot list UI

`BallotCountRow` switches from the submitted-voter list to the protected public
ballot list when the election opt-in is enabled. Each participant can open
`/election/:id/ballot/:index`, which renders the stored payload through the
shared `BallotView` in read-only mode and provides Previous/Next paging. The
route always gets its records from `usePublicBallots()` / `get_public_ballots`;
it never reads other voters' ballot rows directly. A denied request does not
retry, so a guessed protected URL promptly presents a generic error rather than
remaining on a loading spinner. The list dialog is addressable as
`/election/:id?voters=open`; its marked history entry and the ballot origin
markers make `overview → dialog → ballot → Back → dialog → Back → overview`
stable without re-entering the ballot.

## Realtime polling integration

When `realtime_results` is also enabled, `useElectionRealtime` invalidates the
public-ballots query on the same tick as the results, submitted-count, voter,
and pending-invitee queries, so the ballot list stays fresh as new ballots come
in. See [[Realtime Results]].
