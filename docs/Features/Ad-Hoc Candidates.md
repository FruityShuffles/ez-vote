# Ad-Hoc Candidates

**Flag:** `election.allowVoterCandidates = true`

Allows voters to add new candidates while the election is open. Both the election detail screen and the ballot screen must handle this.

## Where Candidates Can Be Added

`ElectionDetailScreen` shows an "Add Candidate" input when `allowVoterCandidates` is true and the election is open. The add action calls `CandidateRepository.addCandidate()`, which inserts into `candidates` and the DB trigger bumps `elections.candidates_updated_at`.

Voters who already have the ballot screen open need to be notified without losing their in-progress ballot.

## Polling in ElectionDetailScreen

Every 10 seconds:

```
1. candidateRepository.countForElection(electionId) → int (lightweight: counts IDs only)
2. Compare to candidatesProvider(electionId).value?.length
3. If different: ref.invalidate(candidatesProvider(electionId))
4. Provider refetches, screen rebuilds with new candidate list
```

The count-first approach avoids triggering a loading-state flash on every tick. The full fetch only happens when something actually changed.

## Polling in BallotScreen

Same count-check pattern, but the response is different because the voter has in-progress state:

```
1. Check count as above
2. If different: invalidate candidatesProvider → fetch fresh list
3. Call _mergeNewCandidates(freshCandidates) — preserves existing scores/rankings
4. Show snackbar: "Candidates were updated. Review your ballot."
```

See [[Ballot State Machine]] → `_mergeNewCandidates()` for how new candidates are merged without resetting the voter's in-progress work.

## Pre-Submit Gate

Before the final ballot submission:

```
1. Re-fetch candidate count from DB
2. If count differs from current state:
     a. Merge new candidates into ballot state
     b. Show warning: "Candidates changed. Please review and resubmit."
     c. Return without submitting
3. On second submit attempt: proceed normally
```

This ensures the voter is aware of and has reviewed any late-breaking candidate additions before their ballot is committed.

## Candidate Removal

If a candidate is deleted (owner action while election is open), polling detects the count decrease and `_mergeNewCandidates` removes the candidate from all state maps:
- Removed from `_scores`
- Removed from `_rankings`
- Removed from `_approvals`
- If selected as `_fptpChoice`: cleared

The ballot UI updates immediately to reflect the removal.

## RLS for Voter Candidate Insertion

The `candidates` table has an INSERT policy that allows voters to insert when `election_allows_voter_candidates(election_id)` returns true. This security-definer helper avoids RLS recursion. See [[RLS Policies]].
