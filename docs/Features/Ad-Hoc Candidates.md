# Ad-Hoc Candidates

**Flag:** `election.allow_voter_candidates = true`

Allows voters to add new candidates while the election is open. Both the election detail surface and the ballot must handle this.

## Where Candidates Can Be Added

`ElectionDetail` shows an "Add Candidate" input (`components/elections/AddCandidateField.tsx`) when the flag is true and the election is open. The add action calls `useAddCandidate`, which inserts into `candidates`; a DB trigger bumps `elections.candidates_updated_at`.

Voters who already have the ballot open need to be notified without losing their in-progress ballot.

## Polling on the Detail Surface

`useElectionRealtime` polls every 10 seconds:

```
1. Read the candidate count (lightweight: counts IDs only)
2. Compare to the loaded candidate list length
3. If different: invalidate electionKeys.candidates(id)
4. The query refetches and the surface re-renders with the new list
```

The count-first approach avoids triggering a loading-state flash on every tick. The full fetch only happens when something actually changed.

## Polling on the Ballot

`routes/Ballot.tsx` uses the same count-check pattern via `useCandidateCount`, but the response differs because the voter has in-progress state:

```
1. Check the count as above
2. If different: invalidate the candidates query → fetch fresh list
3. Toast: "Candidates have been updated — your ballot has been adjusted"
4. A separate effect watching the candidate ids calls merge(freshIds),
   preserving existing scores / rankings / approvals
```

Step 4 is keyed off the candidate **ids** rather than the count, so the ballot resyncs however the list changed — this poll, a background refetch on window focus, or the pre-submit gate. See [[Ballot State Machine]] → `mergeCandidates` for how new candidates are folded in without resetting the voter's work.

## Pre-Submit Gate

Before the final ballot submission:

```
1. Re-fetch the candidate list from the DB (fetchCandidates)
2. If it differs from the loaded list:
     a. Push it into the query cache (the sync effect merges it into ballot state)
     b. Toast: "New candidates were added — please review your ballot before submitting"
     c. Return without submitting
3. On the next submit attempt: proceed normally
```

This ensures the voter is aware of and has reviewed any late-breaking candidate additions before their ballot is committed.

## Candidate Removal

If a candidate is deleted (owner action while the election is open), polling detects the change and `mergeCandidates` removes the candidate from all state:

- Removed from `scores`
- Removed from `rankings`
- Removed from `approvals`
- Dropped from any tie-break group (via `syncTieBreaks`)
- If selected as `fptpChoice`: cleared

The ballot UI updates immediately to reflect the removal.

## RLS for Voter Candidate Insertion

The `candidates` table has an INSERT policy that allows voters to insert when `election_allows_voter_candidates(election_id)` returns true. This security-definer helper avoids RLS recursion. See [[RLS Policies]].
