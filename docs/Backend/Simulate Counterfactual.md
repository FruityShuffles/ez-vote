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
  ]
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

## Tests

`supabase/functions/_shared/counterfactual.test.ts`, run by `deno task test` and by the `Algorithm golden tests` CI workflow (which already triggers on any change under `supabase/functions/`).

Plain unit tests rather than fixtures: the golden corpus exists to lock *algorithm* behavior, and this module does not touch the algorithms. What it guards is the substitution and validation rules — every rejection above, `applyOverrides` not mutating its input, a null-`voter_id` ballot counting but staying untargetable, and `diffWinners` across a flip, a no-op, and a win-becomes-tie.

## Not implemented: minimum changes to flip

The "smallest set of ballot changes that would alter the winner" search was part of the original M20 issue (#106) and was **split into a follow-up issue**. Open questions recorded there: search strategy (greedy substitution of maximally-favorable ballots vs. exhaustive search over small change sets), the compute budget under the edge function's CPU limit, and the need to report honestly whether a result is *proven* minimal or merely the best found within budget — IRV is non-monotonic, so a greedy answer cannot claim minimality.
