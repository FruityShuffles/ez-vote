# Realtime Results

**Flag:** `election.realtime_results = true`

Allows participants to see results update as ballots are cast, without closing the election.

## How It Works

After every ballot submission (or update), if the flag is enabled and the payload actually changed, `routes/Ballot.tsx` calls `triggerRealtimeCompute(electionId)` from `web-react/src/lib/ballot.ts`.

This triggers the edge function in "realtime mode" (see [[Edge Function]]). The function recomputes all algorithm results and upserts them into the `results` table. The election stays open.

The call is **non-blocking**: it is not awaited and its errors are swallowed, so it cannot fail the ballot submission. The voter's experience is not degraded if the compute call fails.

## Ballot Change Detection

To avoid redundant compute calls when a voter re-opens and re-submits without making any changes, the new payload is compared to the saved one with `payloadsEqual` (`lib/ballot.ts`) and the compute call is skipped when they match.

Comparison is reliable because payload objects are always built from candidate order by the shared derivation module, so equivalent ballots serialize identically.

## Results Polling

When the flag is true and the election is open, `useElectionRealtime` (`web-react/src/lib/useElectionRealtime.ts`) polls every 10 seconds:

```
1. Read results.updated_at for the election (and, for ad-hoc elections, the candidate count)
2. If newer than last-seen: invalidate the dependent TanStack Query caches
3. ResultsView re-renders with fresh data
```

The `updated_at` column on `results` (added in migration 014) makes this lightweight — the poll only fetches the timestamp, not the full result data, until a change is detected. The hook wraps a pure `runRealtimePoll` core, so the ordering and change-detection logic is unit-tested without a browser (`useElectionRealtime.test.ts`).

On a change it invalidates the results, submitted-count, voter, pending-invitee, and public-ballots queries on the same tick, so every live list on the detail surface stays consistent with the results.

**Why polling, not Supabase Realtime channels.** Polling needs no backend change — no `ALTER PUBLICATION`, no `REPLICA IDENTITY` — and the poll is cheap because it reads a single timestamp. Migrating to Realtime channels is tracked as a follow-up issue.

## Interaction with Election Close

When the owner closes the election (calls the edge function with `close=true`), the same compute logic runs once more — final results are committed and the `status` flips to `'closed'`. After close, polling stops: the hook only polls while the election is open and the flag is set.

## Authorization

Realtime compute calls (`close=false`) are allowed for any election participant, not just the owner. The edge function verifies that the caller is either the owner or is in `election_voters`. Close calls (`close=true`) are owner-only.

See [[Edge Function]] for the full auth check flow.
