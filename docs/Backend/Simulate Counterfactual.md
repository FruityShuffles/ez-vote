# Edge Function: simulate-counterfactual

**Location:** `supabase/functions/simulate-counterfactual/index.ts` (Deno)
**Pure helpers:** `supabase/functions/_shared/counterfactual.ts`
**Tabulation logic:** `supabase/functions/_shared/tabulate.ts` (shared with [[Backend/Edge Function|compute-results]])
**Deploy:** `supabase functions deploy simulate-counterfactual --no-verify-jwt`

Answers *"what if people had voted differently?"* — loads a real election's ballots, applies caller-supplied overrides to a copy, re-runs `tabulate()` on both the original and the copy, and returns the two outcomes side by side. **Nothing is persisted.**

This is M20, the backend half of the counterfactual capstone (see [[Migration/Overview]]). The UI that consumes it is M21.

## Why a separate function, not a `dryRun` flag on compute-results

A flag is the classic mutation-safety footgun: one endpoint holding write credentials, with a boolean deciding whether it writes. Any future refactor that mishandles the flag silently overwrites a real election result — an irreversible outcome on a voting product.

Instead, the guarantee is structural: **this function never reads `SUPABASE_SERVICE_ROLE_KEY`.** It holds no privileged credential, so it has no write path to misuse. `compute-results` holds that key because it genuinely must upsert results and close elections; this endpoint does neither.

That absence is load-bearing and looks like an oversight to anyone skimming, so the file says so at the top. **Do not add a service-role client here, even to "just read" something.**

## Read path

Every read runs as the caller — anon key plus the caller's own JWT — so the function can only reach what that user could already reach in the app.

| Read | Path | Enforced by |
|---|---|---|
| Identity | `auth.getUser()` | Same as `compute-results` |
| Election row | `from('elections')` | RLS: owner or joined voter |
| Candidates | `from('candidates')` | RLS: owner or joined voter |
| **All ballots** | `rpc('get_public_ballots')` | The RPC's own checks (below) |

`get_public_ballots()` (migrations 020/021, see [[Features/Public Ballots]]) already enforces: election exists, `public_ballots = true` **for every caller including the owner**, and caller is owner or a member of `election_voters`. Its errors are surfaced verbatim.

### What each refusal actually looks like

Verified against the deployed function. Note the ordering effect: the election row is read through RLS *before* the RPC runs, so a caller with no access to the election never reaches the RPC's own membership check.

| Caller | Response |
|---|---|
| No `Authorization` header | `Missing Authorization header` |
| Invalid or expired token | `Unauthorized` |
| Owner or joined voter, `public_ballots = false` | `Public ballots not enabled` |
| Not a participant (any election they can't see) | **`Election not found`** — RLS hides the row first |
| Owner or joined voter, `public_ballots = true` | 200 |

So the RPC's `Not a participant` message is effectively unreachable through this endpoint. That's the desirable behavior — it doesn't confirm an election exists to someone with no access — but M21 should not expect to distinguish "not a participant" from "no such election" here.

Reusing that RPC keeps the privacy rules in one place. Writing a second copy of them here is exactly how the owner-bypass bug that migration 021 fixed would come back.

**No new exposure.** A caller who can run a simulation can already page through every ballot in that election by name via the ballot-count row (`BallotCountRow.tsx` → `/election/:id/ballot/:index`), which is likewise not gated on having voted. Simulation shows them nothing new.

**No status gate.** Works on open and closed elections alike, matching that same ballot list.

## Prerequisite and its consequence

Simulation requires `public_ballots = true`. You cannot re-count ballots you cannot read, and there is no partial version — IRV and STAR need each individual ballot, not the stored totals.

`public_ballots` can only be set while an election is a draft (`web-react/src/routes/ElectionForm.tsx` blocks editing once status leaves `draft`). **An election already open or closed without the flag can never enable it, so it is permanently ineligible for counterfactual analysis.**

This was accepted knowingly when M20 was built: the site had no active user traffic, so the affected stock was essentially test data. Note that "just let owners toggle the flag later" is *not* the fix — it retroactively exposes ballots cast under an expectation of privacy, which is the owner bypass migration 021 deliberately closed. The forward path is instead a database-enforced read-only connection (`SET TRANSACTION READ ONLY` over `SUPABASE_DB_URL`), which was considered and deferred; it would decouple simulation from the flag without weakening any privacy guarantee.

## Request

```jsonc
{
  "election_id": "uuid",
  "overrides": [
    { "op": "replace", "voter_id": "uuid", "payload": { /* ... */ } },
    { "op": "remove",  "voter_id": "uuid" },
    { "op": "add",     "payload": { /* hypothetical extra voter */ } }
  ],
  "find_flip": false  // opt in to the flip search (below); defaults to false
}
```

`overrides` defaults to `[]` — omit it to get a plain recomputation.

Payloads use the same shape as `ballots.payload` ([[Backend/Schema]]): `approval`, `irv`, `star`, `fptp`.

**Overrides key on `voter_id`**, which `get_public_ballots` already returns. List position would be the obvious alternative but is unstable — the RPC orders by display name, so a ballot arriving between the client's fetch and the simulate call shifts every index after it.

**Limitation:** `ballots.voter_id` is nullable (nulled when an account is deleted). Such ballots still count toward every tally but have no stable handle, so no override can target them. Same for `add`ed ballots within a single request.

### Validation

Rejected with a 400 listing every problem found (not just the first). Rejecting is deliberate — an unrecognized candidate id or a misspelled payload key would otherwise tabulate silently as a blank ballot and quietly skew the result:

- unknown `op`; entry that isn't an object
- `replace`/`remove` without a `voter_id`, or naming a voter with no ballot
- two overrides targeting the same voter (this is also what makes the result order-independent)
- payload that isn't an object, or carrying a key other than `approval`/`irv`/`star`/`fptp`
- any candidate id not in this election
- duplicate ids within an `irv` ranking or `approval` list
- STAR scores outside integer 0–5 (the bound the ballot UI clamps to)
- more than 500 overrides
- `find_flip` that isn't a boolean; `find_flip: true` on an election not tabulated with IRV, or with more than 500 ballots or 20 candidates (the flip-search caps)

## Response

```jsonc
{
  "election_id": "uuid",
  "baseline":  [ { "algorithm": "irv", "result_data": { /* ... */ } } ],
  "simulated": [ { "algorithm": "irv", "result_data": { /* ... */ } } ],
  "changed":   { "irv": true, "star": false },
  "ballot_count": { "baseline": 12, "simulated": 13 },
  "applied": { "replace": 2, "remove": 0, "add": 1 }
}
```

`baseline` and `simulated` are both `TabulationResult[]` in the structure documented in [[Backend/Edge Function]] — same algorithms, same `result_data` shapes, FPTP comparison row included exactly when `include_fptp` is set.

**`baseline` is recomputed, not read from the `results` table.** That keeps the two sides strictly comparable (same code path, same candidate name mapping) and makes the endpoint work on an open election whose results were never persisted.

`changed` compares each algorithm's `winners` array **positionally** — order carries meaning, since `result_data.winner` is `winners[0]`.

Errors return 400 with `{ "error": "..." }`, matching `compute-results`.

## Flip search (`find_flip`)

The rest of the original M20 requirement (#106, shipped as #120): *what is the smallest set of ballot changes that would make some other candidate win?* Setting `find_flip: true` runs a budgeted greedy search (`supabase/functions/_shared/flip.ts`) and adds a `flip` field to the response.

**IRV only.** Approval and FPTP flips are analytically uninteresting — the minimum is readable off the tallies — and STAR is deferred until the approach is proven for IRV. The election must therefore include `irv` in its algorithms. The `flip.algorithms` array shape exists so STAR can be added later without a breaking change.

```jsonc
"flip": {
  "tabulations_used": 22, "budget": 400, "budget_exhausted": false,
  "algorithms": [{
    "algorithm": "irv",
    "distance_metric": "irv_adjacent_transposition",
    "baseline_winners": ["Bob"],
    "best": "cand-c",              // cheapest flipped target: min k, then min total distance
    "targets": [{                  // one entry per baseline non-winner
      "candidate_id": "cand-c", "candidate_name": "Carol",
      "status": "flipped",         // or "no_flip_found" | "budget_exhausted"
      "k": 1,                      // ballots changed — an UPPER bound
      "proven": true,              // true only when k = 1
      "winners": ["Carol"],        // outcome with the changes applied (shows win vs tie)
      "changes": [{
        "voter_id": "uuid",
        "payload": { "irv": ["cand-a", "cand-c", "cand-b"] },  // a ready-made replace override
        "distance": 1              // adjacent transpositions from the voter's original ranking
      }]
    }]
  }]
}
```

**What the answer means — and honestly does not mean.** The per-target question is *"what makes this candidate a (co-)winner?"* — entering a tie counts, consistent with how `changed` treats a win becoming a tie. It is deliberately narrower than `changed`'s whole-array comparison (a tied baseline collapsing to a sole winner is a change no target describes). Three honesty rules are load-bearing, all forced by IRV's non-monotonicity:

- `k` is an **upper bound**. `proven` is true only when `k = 1` (zero changes cannot unseat the baseline outcome); for `k ≥ 2` a cheaper set the greedy never tried may exist.
- `no_flip_found` means the heuristic found nothing, **not** that no flip exists. The search only tries promoting the target up ballots; flips reachable only by other edits (e.g. demoting the target on a ballot that already ranks them first) are invisible to it. There is a regression test locking exactly that case.
- Each change is the voter's original ballot with the target bubbled up just far enough ("ladder-minimized", iterated to a fixed point) — heuristically small, **not proven minimal**.

**Search shape.** Greedy: repeatedly rewrite whichever eligible ballot most props up the current leaders to maximally favor the target, re-tabulating each step via the shared `tabulate()` (no duplicated IRV logic), then minimize each change back toward the voter's original ranking. Only attributable ballots (`voter_id` not null) are ever changed. The search runs on the **baseline** ballots and ignores any `overrides` in the same request, so every reported change is a valid `replace` override against the live election.

**Budget.** All tabulations flow through one gate: a count budget (`MAX_FLIP_TABULATIONS = 400`) backed by a wall-clock deadline (`MAX_FLIP_MS = 750`), sized by benchmark (a worst-case 500×20 tabulation ≈ 1.3 ms, so the full count budget ≈ 530 ms) to stay inside the edge function's ~2 s CPU ceiling. Input caps: `MAX_FLIP_BALLOTS = 500` (equal to the override cap, so any answer is replayable), `MAX_FLIP_CANDIDATES = 20`. Exhaustion is never an error: verified flips are always retained (a flip cut short mid-minimization ships less-minimized changes, still `flipped`), unverified targets report `budget_exhausted`, and the top-level `budget_exhausted` flag says the gate tripped.

**No new exposure, still.** Every `voter_id` in `flip` comes from the same `get_public_ballots` rows this response already returned to this caller; the search adds derived payloads for those voters and nothing else. And it is pure compute over data already fetched — no new reads, no service-role key, so the structural mutation guarantee above is untouched.

**M21 caveat.** The changes are raw payload edits to the `irv` key only. The explorer's ballot editor canonicalizes payloads through derivation templates (`ballotState.ts` / `derive.ts` — templates that derive IRV from STAR scores would discard a raw ranking edit), so the UI must render server-suggested changes read-only or translate them into template-consistent edits. That wiring is follow-up work; see [[Features/Counterfactual Explorer]].

## Tests

`supabase/functions/_shared/counterfactual.test.ts` and `_shared/flip.test.ts`, run by `deno task test` and by the `Algorithm golden tests` CI workflow (which already triggers on any change under `supabase/functions/`).

Plain unit tests rather than fixtures: the golden corpus exists to lock *algorithm* behavior, and these modules do not touch the algorithms. `counterfactual.test.ts` guards the substitution and validation rules — every rejection above, `applyOverrides` not mutating its input, a null-`voter_id` ballot counting but staying untargetable, and `diffWinners` across a flip, a no-op, and a win-becomes-tie. `flip.test.ts` guards the search contract, above all its honesty: every `flipped` answer must replay through the overrides path to a real flip, `no_flip_found` is locked against a profile where a flip exists but only via a move the greedy never tries, exhaustion at each phase keeps exactly what was verified, and the fixed-point minimization is locked against a profile where a single sweep returns a larger answer.
