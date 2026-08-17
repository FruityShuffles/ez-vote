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
     Best-effort: precompute the IRV flip search and the strategic
       voting search, and upsert both into one flip_searches row
10. Return { success: true, results: [...] }
```

Step 6 uses the service-role key (set via Supabase secrets, not in client bundle) to read all ballots regardless of voter ownership — required because voters can't read each other's ballots via RLS.

## Flip-search precompute (#146)

On `close=true` only, the function also computes the IRV flip search over the ballots it already fetched and upserts it into `flip_searches`, so the what-ifs explorer can render the answer without paying ~500 ms of server search on every visit ([[Features/Counterfactual Explorer]]). `simulate-counterfactual` still answers `find_flip: true` live for elections with no row.

Three properties are deliberate:

- **Eligibility is `validateFlipInputs()` plus `public_ballots`** — the same gate `simulate-counterfactual` applies, so eligibility can never drift between the two paths, and the work is bounded before it starts rather than at the CPU ceiling. Most elections are ineligible and skip it entirely.
- **It runs strictly last**, after the results upserts *and* the status flip, inside a `try/catch` that swallows everything. A failure costs a cache hit and nothing else.
- **It uses `PRECOMPUTE_FLIP_MS` (1500 ms), not `MAX_FLIP_MS` (750 ms)** — a generous backstop against an unbounded close, not a limiter on answer quality. See the CPU budget below.

The realtime path (`close=false`) never precomputes: it can fire on every ballot submission, and the election is still open.

## Strategic-voting precompute (#149)

On `close=true` only, and immediately after the flip precompute, the function also runs the per-method strategic voting search — *could any voter have gotten a better outcome by voting differently?* — and stores it in the same `flip_searches` row, under `strategy` (migration 024). See [[Features/Strategic Voting]].

Four properties are deliberate:

- **Eligibility is `validateStrategyInputs()` plus `public_ballots`** — the caps only. Unlike the flip search there is **no algorithm requirement**: every method has a strategy space, so any tabulated election is searchable. This is why the row's `result` column is nullable — an approval-only election has a strategy answer and no flip answer.
- **It runs after the flip search, never before.** The flip answer is the shipped, exercised one; if the pair ever runs out of budget, the newer search is the one that should lose.
- **Its deadline is clamped by what the flip search already spent.** Both are pure compute with no awaits, so their wall-clock deadlines are effectively CPU deadlines that *add up*. One clock spans both, and the strategic search gets `min(PRECOMPUTE_STRATEGY_MS, allowance − elapsed)`.
- **Each search has its own `try/catch`, and the write has a third.** A failure in the newer search must not cost the flip answer, or vice versa.

A row is written only when at least one search produced an answer. A row with both columns null is meaningless and is never stored.

### The close-path CPU budget

Supabase caps a function at **2 s of CPU time**, hard — [documented](https://supabase.com/docs/guides/functions/limits) as "actual time spent on the CPU per request", explicitly *excluding* async I/O. The 400 s wall-clock limit is not what binds here. DB round trips are I/O and cost nothing against the CPU ceiling; the tabulation loops are pure compute and cost all of it.

Measured at worst-case eligible size (500 ballots × 20 candidates), the largest input the validators admit — re-measured for #149:

| Phase | CPU |
|---|---|
| `tabulate()` over every algorithm + the FPTP row | ~5 ms |
| Flip search, spending its full 400-tabulation count budget | ~596 ms |
| Strategic voting search, spending its full 300-tabulation count budget | ~334 ms |
| **Total** | **~935 ms** of the 2 s ceiling |

Both searches spend their entire count budget at this size, so this is the ceiling, not a sample. About **1 s of headroom remains**.

Three consequences worth holding onto before changing anything here:

- **The count budget is the limiter; the deadline is a backstop.** `PRECOMPUTE_FLIP_MS` sits at 1500 ms — roughly double what the count budget actually needs — so it is never reached on a sane isolate. A deadline set below ~720 ms silently truncates the search to a fraction of its tabulations, and does so on the largest elections, where the answer matters most. Tightening it is not a safe way to buy headroom; it just degrades stored answers.
- **The deadline cannot be raised past the ceiling.** The search is pure compute with no awaits, so its wall-clock deadline is effectively CPU time. At or above ~2 s it can never fire: the platform kills the isolate first, and that kill is uncatchable — no `catch` runs and no response is sent, so the owner's close appears to fail on an election that is in fact already closed with correct results. A deadline past the ceiling removes this protection rather than relaxing it.
- **A per-search deadline bounds nothing but that search.** If future work adds real CPU to this path, the total grows regardless of what any one search is allowed. The number to check against is the ~1 s of remaining headroom above, re-measured — not a single search's deadline. #149 is the worked example: it added a second search, so it re-measured the table rather than trusting the flip search's own budget to hold the line. When it stops fitting, the fix is to move the precompute off the close request path, not to keep shaving the search. (`EdgeRuntime.waitUntil` is *not* that fix: background work counts against the same CPU budget, and it races the client's navigation to the explorer.)

If an owner ever reports a close that failed on an election that turns out to be closed with correct results, a CPU-ceiling kill here is the first thing to check — it is uncatchable, so the `try/catch` cannot report it.

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
