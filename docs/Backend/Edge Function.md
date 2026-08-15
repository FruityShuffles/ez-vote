# Edge Function: compute-results

**Location:** `supabase/functions/compute-results/index.ts` (Deno)
**Tabulation logic:** `supabase/functions/_shared/tabulate.ts` (pure TypeScript, no imports)
**Deploy:** `supabase functions deploy compute-results --no-verify-jwt`

The endpoint is a thin wrapper: load election/candidates/ballots → call the shared `tabulate()` helper → persist results → close (if requested). All algorithm code lives in `_shared/tabulate.ts`, which exports the four algorithm functions plus a `tabulate(algorithms, includeFptp, candidates, ballots)` orchestrator that owns algorithm dispatch and the FPTP→IRV fallback wiring. The module deliberately has zero Deno/network imports so it can be imported from any TypeScript runtime — it is the single source of truth that the [[Backend/Simulate Counterfactual|simulate-counterfactual]] function and the golden-test corpus also consume.

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
     Best-effort: precompute the IRV flip search and upsert flip_searches
10. Return { success: true, results: [...] }
```

Step 6 uses the service-role key (set via Supabase secrets, not in client bundle) to read all ballots regardless of voter ownership — required because voters can't read each other's ballots via RLS.

## Flip-search precompute (#146)

On `close=true` only, the function also computes the IRV flip search over the ballots it already fetched and upserts it into `flip_searches`, so the what-ifs explorer can render the answer without paying ~500 ms of server search on every visit ([[Features/Counterfactual Explorer]]). `simulate-counterfactual` still answers `find_flip: true` live for elections with no row.

Three properties are deliberate:

- **Eligibility is `validateFlipInputs()` plus `public_ballots`** — the same gate `simulate-counterfactual` applies, so eligibility can never drift between the two paths, and the work is bounded before it starts rather than at the CPU ceiling. Most elections are ineligible and skip it entirely.
- **It runs strictly last**, after the results upserts *and* the status flip, inside a `try/catch` that swallows everything. A failure costs a cache hit and nothing else.
- **It uses `PRECOMPUTE_FLIP_MS` (500 ms), not `MAX_FLIP_MS` (750 ms).** A CPU-ceiling kill here is *uncatchable* — the isolate is terminated, no `catch` runs and no response is sent, so the owner would see their close fail on an election that is in fact already closed with correct results. If that is ever reported, this is where to look.

The realtime path (`close=false`) never precomputes: it can fire on every ballot submission, and the election is still open.

One divergence worth knowing: these ballots come straight from the table, whereas a live search reads them through `get_public_ballots()`, which orders by display name. The greedy search breaks ties by array order, so the two paths can name different — equally cheap, equally valid — ballots for the same election. "Re-run and compare" is therefore a misleading way to debug a stored answer.

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

`ResultsView` (`web-react/src/components/results/ResultsView.tsx`) renders each algorithm's `result_data` differently based on the `algorithm` field.

> Note: the keys inside `tallies` / `scores` / `runoff` / `rounds[].counts` and the `winner` / `winners` / `runner_up` values are candidate **names**, not UUIDs (the helper maps IDs to names before emitting `result_data`). A multi-candidate IRV final elimination renders `runner_up` as an `&`-joined string (e.g. `"Bob & Carol"`).

## Golden corpus

`tabulate()` is guarded by a golden-test corpus so the algorithms can't drift. It is the single tabulation implementation — the app and both edge functions call this one helper.

- **Tests:** `supabase/functions/_shared/tabulate.test.ts` — loads every `*.json` fixture under `_shared/fixtures/{synthetic,historical}/`, runs `tabulate()` against each `input`, and asserts the output deep-equals the pinned `expected` (the **full** `result_data` shape, not just winners).
- **Synthetic fixtures** cover each algorithm plus edge cases (multi-candidate IRV elimination ties, all-tied outcomes, STAR runoff/score-tie tiebreaks, the FPTP `irv[0]` fallback, empty ballots, unknown-algorithm default).
- **Historical fixtures** are snapshots of closed elections, generated by `supabase/functions/scripts/export-fixtures.ts` (`deno task export-fixtures`); user IDs are scrubbed and the stored `result_data` is used as the golden value. See `_shared/fixtures/README.md`.
- **Run locally:** from `supabase/functions/`, `deno task test`. **CI:** `.github/workflows/tabulate-tests.yml` runs it on any change under `supabase/functions/`.
