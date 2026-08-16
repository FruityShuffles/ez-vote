# Case Studies

**Tracker:** #139 · **Backend:** #140 ([[Backend/Schema]], [[Backend/RLS Policies]]) · **Seeding:** #141

Case Studies are pre-generated, completed, publicly viewable elections that exist to be
taken apart. Each one teaches exactly one voting-theory lesson using real ballots you can
edit in the [[Features/Counterfactual Explorer|what-ifs explorer]]. Where **Learn**
explains the theory, Case Studies is the worked example: a paradox you can reproduce by
dragging a candidate up a ballot.

"Case Studies" is the user-facing name (#139 asked for something better than the working
title "Mock Elections").

**Status:** shipped. The backend (#140), seeding pipeline plus first case study
(#141), signed-in dashboard/viewing UI (#142), and sessionless guest access
(#143) are complete.

## Dashboard and public viewing

`/dashboard?tab=case-studies` lists showcase elections newest first through
`useCaseStudies()`. The hook has no user lookup, so signed-in and sessionless guest
viewers use the same query. Cards deliberately carry no owner,
vote-status, or delete affordance, and showcase-election breadcrumbs return to the Case
Studies tab.

Election details distinguish joined membership from ballot status with a direct read of
the viewer's own `election_voters` row. A signed-in non-participant or guest can read the
closed results and open **Explore what-ifs**, but cannot vote, add candidates, or open
the participant-only voter/pending-invitee surfaces. Guests do not issue the
session-owned existing-ballot query. The submitted-ballot total remains visible as
non-interactive context. Joined voters and owners retain the existing detail behavior.

Guests enter from **Continue as guest** on the landing page. The local flag survives
reloads but creates no Supabase identity, so every Case Study read and what-if request
runs as `anon`. Case Studies is their default dashboard tab; My Elections remains
visible with a lock and account-creation explanation. Create, edit, vote, and join routes
thread the requested destination through signup, while a real session automatically
clears guest mode.

## What makes an election a case study

Two independent flags on `elections`, both service-role-only (migration 022):

| Flag                    | Meaning                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibility = 'public'` | Anyone — including sessionless visitors on the `anon` role — can read the election, its candidates, its results and (via `get_public_ballots`) its ballots. Also exempts the row from the 60-day pg_cron purge. |
| `showcase = true`       | It belongs in the curated Case Studies list. Kept separate so a future user-shared public election does not automatically become teaching material.                                                             |

Seeded case studies also set `public_ballots = true` — without it `get_public_ballots()`
refuses every caller, and the explorer has nothing to simulate.

No API path can set any of this: the owner INSERT/UPDATE policies carry
`with check (visibility = 'private' and showcase = false)`. The seed script's service-role
key is the only writer, which is also why owners cannot edit a public election at all.

## Seeding

`supabase/functions/scripts/seed-case-studies.ts`, run as a Deno task from
`supabase/functions/`:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno task seed-case-studies
deno task seed-case-studies -- --dry-run        # report, write nothing
deno task seed-case-studies -- --only=<slug>
```

The service-role key is required for two reasons: it bypasses RLS, and the placeholder
voters can only be minted through the auth admin API. Never commit it.

On Windows, dot-source `tools/Set-SupabaseEnv.ps1` first and it supplies both variables
from Credential Manager — see [[Backend/Service-Role Scripts]] for that and the rest of the
handling rules.

### Idempotency

Re-running converges on the fixtures rather than duplicating them. Two mechanisms:

1. **Derived ids.** The election id is `uuidv5(NAMESPACE, "election:<slug>")` and each
   candidate id is `uuidv5(NAMESPACE, "candidate:<slug>:<name>")`, so a re-run addresses
   the rows it wrote last time. This is why there is no `slug` column and no title
   matching — and why a case study keeps the same URL forever. `NAMESPACE` in
   `case-study-fixture.ts` is a constant, not a knob: changing it orphans every seeded
   election.
2. **Read, diff, then write.** Every step reads current state and writes only real
   differences. That is load-bearing, not tidiness — `ballots` has a
   `bump_ballots_updated_at` trigger and a candidate insert bumps
   `elections.candidates_updated_at`, so blind upserts would churn timestamps the UI
   shows. A second run reports `0 created, 0 updated, 0 deleted`.

Rows are pruned to match the fixture, but **only inside the seeded election** — a
candidate, ballot or result the fixture no longer declares is deleted; nothing outside a
case study is ever touched. Auth accounts are never deleted.

### Placeholder accounts

Counterfactual overrides key on `ballots.voter_id` and the flip search skips null-voter
ballots, so every ballot must belong to a real account: `ballots.voter_id` → `profiles.id`
→ `auth.users.id`. The script therefore creates one account per fixture voter, plus a
single shared owner.

|        |                                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| Owner  | `owner@case-studies.invalid`, display name "EZVote Case Studies"                    |
| Voters | `<slug>.<voter-name>@case-studies.invalid`, display name = the fixture's voter name |

Those accounts cannot be used, three ways over: `.invalid` is reserved by RFC 2606 and can
never route (so no password reset and no magic link reaches them), the password is 32
random bytes that are never logged or stored, and each account is banned for ~100 years
immediately after creation. They exist only to hang ballots on.

Account lookup goes through `profiles.email` rather than paging `admin.listUsers`; if a
profile is missing after creation (a trigger that failed once) the script inserts it, and
if a display name has drifted from the fixture it repairs it.

### Results

Results are computed by importing `_shared/tabulate.ts` directly, not by calling the
`compute-results` edge function — the same code path production results take, one fewer
moving part. Before writing anything, the script re-checks the fixture's `lesson` claims
against that tabulator and aborts the fixture if they no longer hold.

### Flip search

Because case studies are inserted already `closed`, they never pass through
`compute-results`, so this script is also the writer for their precomputed flip search
(#146) — same read-diff-write treatment as `results`, including the prune. Two details
are load-bearing and easy to get wrong:

- **Real profile UUIDs, not the fixture's voter names.** `tabulate()` ignores
  `voter_id`, so the lesson gate and the `results` step get away with a name→name map.
  The flip search does not: `FlipChange.voter_id` is what the explorer keys ballots,
  chips and applied-suggestion matching on, so seeding from the name map would render
  every suggestion as "Unnamed voter" and no "Try these changes" would ever apply.
- **`timeLimitMs: Infinity`.** `findMinimalFlips` is bounded by a wall-clock deadline
  as well as a tabulation count, so with the default the stored answer would depend on
  how busy the machine was and a re-run could churn the row — breaking the no-op
  invariant the whole script is built on. With only the count budget it is a pure
  function of the fixture. `case-studies.test.ts` locks that determinism, and that
  every reported change names a real ballot.

In a `--dry-run` before the placeholder accounts exist there are no UUIDs to key the
search on, so the step reports `create flip search` and writes nothing.

## Fixture format

One JSON file per case study in `supabase/functions/scripts/case-studies/`. Candidates and
voters are named, never id'd; the script resolves names to the derived ids above.

| Field          | Notes                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`         | Lowercase kebab-case. The identity of the case study — changing it seeds a new election.                                                                                                                                     |
| `title`        | Named for what it teaches, not for its topic (#139).                                                                                                                                                                         |
| `description`  | Shown on the election. Lead with the human stake; the mechanism is the explanation.                                                                                                                                          |
| `algorithms`   | e.g. `["irv"]`.                                                                                                                                                                                                              |
| `include_fptp` | `false` when the lesson lives inside one method — a single-method case study keeps it sharp. `true` only when the comparison *is* the lesson, as in `fptp-vote-splitting`.                                                    |
| `candidates`   | Names, in ballot display order.                                                                                                                                                                                              |
| `voters`       | `{ name, payload }`. Payload keys are `irv` / `approval` / `star` / `fptp`, holding candidate **names**, and must match what the app would really store for the chosen `algorithms` (see [[Architecture/Ballot Templates]]). |
| `lesson`       | See below.                                                                                                                                                                                                                   |

The `lesson` block is what the case study claims to teach, written so it can be executed:

```json
"lesson": {
  "summary": "…",
  "baseline_winners": { "irv": ["Tacos"] },
  "changes": [{ "voter": "Gita", "payload": { "irv": ["Tacos", "Pizza", "Sushi"] } }],
  "expected_winners": { "irv": ["Sushi"] }
}
```

`baseline_winners` and `expected_winners` are **algorithm → winner names**, keyed exactly
as `tabulate()` labels its results: every entry of `algorithms`, plus `fptp` when
`include_fptp`. Coverage must be total — `validateWinners` in `case-study-fixture.ts`
rejects both a missing key and an unknown one. That is not pedantry:

- A case study whose lesson *is* a disagreement between methods (`fptp-vote-splitting`)
  cannot state its claim with a single winner list at all.
- A partial map would publish a results card no test ever looked at.
- In `expected_winners`, the methods the exercise leaves **unchanged** are half the lesson.
  "FPTP flips and nothing else moves" is a claim, and full coverage is what asserts it.

`changes` is deliberately shaped like the explorer's `replace` overrides, so it replays
verbatim against `simulate-counterfactual`. `scripts/case-studies.test.ts` runs in
`deno task test` and asserts that `tabulate()` reproduces `baseline_winners`, that
applying `changes` produces `expected_winners`, that at least one method's winner actually
moved, that every ballot is attributable, and that the flip search finds a flip for every
loser. The seed script re-checks the same two maps before it writes anything, naming the
algorithm that drifted. That suite is the point: a case study is a **published claim**, and
if the algorithm ever drifts the claim quietly becomes a lie on a page newcomers are
pointed at. This makes that a red build instead.

The flip-search assertions stay IRV-scoped — `findMinimalFlips` only answers for IRV — so
they read `baseline_winners.irv`.

### Adding a case study

1. Write the fixture. Design the ballot profile so the lesson is verifiable and the
   election is small enough to read (~15–20 ballots).
2. `deno task test` — the new fixture is picked up automatically; fix the profile until
   the lesson assertions pass.
3. `deno task seed-case-studies -- --dry-run`, then run it for real.

## Shipped case studies

### `irv-non-monotonicity` — "When ranking a candidate higher makes them lose"

Seventeen coworkers rank three lunch spots (Tacos, Pizza, Sushi), IRV only.

- **Baseline:** round 1 is Tacos 6, Pizza 6, Sushi 5. Sushi is eliminated and Tacos wins
  10–7.
- **The exercise:** Gita and Hugo rank Pizza first and Tacos _last_. Move Tacos to the top
  of their two ballots — the only change, and it only helps Tacos. Round 1 becomes Tacos
  8, Pizza 4, Sushi 5, so **Pizza** is eliminated instead; its voters flow to Sushi, and
  Sushi wins 9–8.
- **Why it bites:** Gita and Hugo sincerely prefer Pizza > Sushi > Tacos. The honest
  ballot hands them their last choice; the insincere one hands them their second. IRV's
  non-monotonicity is not a curiosity here — it is what makes lying pay.

The profile is razor-thin by design: `find_flip` reports `k = 1, proven: true` for both
losers, so the flip panel has something clean to say as well.

### `fptp-vote-splitting` — "When the option most voters ranked last still wins"

Fifteen neighbours choose what to build on a vacant lot (Parking Lot, Community Garden,
Skate Park). The first multi-method case study: Approval + IRV + STAR with
`include_fptp: true`, so the ballots are Template G — the ranking derives from the scores,
approvals are the top-K of that ranking, and FPTP falls back to `payload.irv[0]`.

Three blocs: 6 score Lot 5 / Garden 1 / Skate 0; 5 score Garden 5 / Skate 3 / Lot 0; 4
score Skate 5 / Garden 4 / Lot 0.

- **Baseline:** Approval (Garden 9), IRV (Skate eliminated, Garden 9–6) and STAR (Garden 47
  by score, then 11–4 in the runoff) all elect the **Community Garden**. FPTP reads first
  choices only — Lot 6, Garden 5, Skate 4 — and elects the **Parking Lot**, which nine of
  the fifteen ranked last.
- **The exercise:** move Community Garden to the top of the four skate-park ballots. FPTP
  flips to the Garden and every method finally agrees, at the cost of four people
  abandoning their real first choice.
- **Why it bites:** the garden and skate blocs want the same thing and a single mark gives
  them no way to say so. FPTP's answer here is an artifact of who else was on the ballot,
  and the only remedy it offers the voter is to stop voting sincerely.

This is the fixture the per-algorithm `lesson` maps exist for, and the first election on
the site where `analysis.ts` sees three methods agree while FPTP dissents — see
[[Features/Election Analysis]].
