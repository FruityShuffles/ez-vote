# Edge Function: compute-results

**Location:** `supabase/functions/compute-results/index.ts` (Deno)
**Tabulation logic:** `supabase/functions/_shared/tabulate.ts` (pure TypeScript, no imports)
**Deploy:** `supabase functions deploy compute-results --no-verify-jwt`

The endpoint is a thin wrapper: load election/candidates/ballots → call the shared `tabulate()` helper → persist results → close (if requested). All algorithm code lives in `_shared/tabulate.ts`, which exports the four algorithm functions plus a `tabulate(algorithms, includeFptp, candidates, ballots)` orchestrator that owns algorithm dispatch and the FPTP→IRV fallback wiring. The module deliberately has zero Deno/network imports so it can be imported from any TypeScript runtime — it is the single source of truth that the future `simulate-counterfactual` function and the golden-test corpus also consume (see `docs/Migration/Overview.md`).

The `--no-verify-jwt` flag is required because the Supabase gateway rejects ES256 user JWTs. Auth is verified inside the function itself via `supabase.auth.getUser()`.

## When It's Called

Two call paths:

1. **Election close** (`close=true`): Called from `ElectionDetailScreen` owner controls. Computes results for all algorithms and sets `election.status = 'closed'`. Only the owner can trigger this.

2. **Realtime results** (`close=false`): Called from `BallotScreen` after ballot submission, if `election.realtime_results = true`. Recomputes results without closing the election. Any participant can trigger this. Errors are non-blocking — ballot submission succeeds regardless.

## Request Flow

```
1. Extract JWT from Authorization header
2. Create anon Supabase client, call getUser() → verified uid
3. Fetch election by ID
4. If close=true: verify uid == election.owner_id
   If close=false: verify uid is in election_voters OR owns election
5. Fetch all candidates for election
6. Fetch all ballots for election (service-role client, bypasses RLS)
7. Call tabulate(algorithms, include_fptp, candidates, ballots)
     → one { algorithm, result_data } entry per algorithm,
       plus a trailing fptp entry when include_fptp is set
8. Upsert each entry into the results table
9. If close=true:
     UPDATE elections SET status='closed' WHERE id=election_id
10. Return { success: true, results: [...] }
```

Step 6 uses the service-role key (set via Supabase secrets, not in client bundle) to read all ballots regardless of voter ownership — required because voters can't read each other's ballots via RLS.

## Algorithm Implementations

All implemented in `supabase/functions/_shared/tabulate.ts`.

### Approval

```
For each ballot:
  For each candidate_id in payload.approval:
    tallies[candidate_id]++

maxTally = max(tallies.values)
winners = candidates where tallies[id] == maxTally
```

Ties produce multiple winners. No arbitrary ID-based tie-breaking.

### IRV (Instant Runoff Voting)

```
rounds = []
remaining = all candidates

Loop:
  Count first-choice votes from each ballot's payload.irv,
    restricted to candidates still in `remaining`

  If any candidate has majority (> 50%): return that candidate as winner

  minVotes = min(first-choice counts)
  eliminated = all candidates tied at minVotes

  rounds.push({ tallies, eliminated })
  remaining = remaining - eliminated

  If remaining is empty: all remaining candidates are tied winners (rare)
```

Each round eliminates all candidates tied at the minimum — not just one. This means a round can eliminate multiple candidates simultaneously, preserving genuine ties.

### STAR (Score Then Automatic Runoff)

```
Phase 1 — Score:
  Sum scores from payload.star for each candidate
  Top 2 scorers advance to runoff
  (If tied for 2nd, all tied candidates advance — can be 3+ in runoff)

Phase 2 — Automatic Runoff:
  For each ballot:
    Compare scores for runoff candidates
    Award preference point to the higher-scored candidate
    (Ties within a ballot contribute to neither)

Winner = runoff candidate with more preference points
If preference points tied: winner is the one with higher total score
```

### FPTP (First Past The Post)

```
For each ballot:
  vote = payload.fptp ?? payload.irv?[0]  // explicit FPTP or IRV first-choice fallback
  if vote exists: tallies[vote]++

maxTally = max(tallies.values)
winners = candidates where tallies[id] == maxTally
```

The fallback to `payload.irv[0]` allows elections that don't explicitly collect FPTP votes to still compute an FPTP result from IRV data.

## Result Data Structure

Each algorithm upserts a row in `results` with `result_data` JSONB:

```json
{
  "winner": "candidate-uuid",
  "winners": ["candidate-uuid"],        // for ties
  "runner_up": "candidate-uuid",
  "rounds": [...],                      // IRV only: per-round tallies
  "tallies": { "uuid": 12, "uuid": 8 }, // Approval, FPTP
  "scores": { "uuid": 47, "uuid": 31 }, // STAR phase 1
  "runoff": { "uuid": 14, "uuid": 11 }, // STAR phase 2
  "total_ballots": 23
}
```

The `ResultsView` widget (`lib/presentation/widgets/results_view.dart`) renders each algorithm's `result_data` differently based on the `algorithm` field.
