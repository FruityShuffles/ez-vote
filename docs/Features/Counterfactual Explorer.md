# Counterfactual Explorer ("what-ifs")

**Issue:** #107 (M21) · **Backend:** [[Backend/Simulate Counterfactual]] (M20, shipped)
**Prototype:** `/design/explore` — unlinked, unguarded, mock data

Lets a participant in a closed public-ballot election change someone's ballot
hypothetically and watch the four voting methods react differently to the same
change. That divergence is the product thesis ([[Decisions/Algorithm Design]]):
showing methods side by side teaches electoral system design in a way a
single-method tool cannot. **Nothing is ever written** — the endpoint holds no
service-role key.

**Status:** shipped. The authenticated picker/editor routes call the read-only
endpoint, and eligible closed elections link to the feature from their results.

## Vocabulary

The feature is **"what-ifs"** in the UI; "counterfactual" stays in code and docs.
The entry button reads **"Explore what-ifs"**, deliberately not the issue's
"Explore Election" — a control should say what happens when you press it.

## Design language

The palette and typeface are fixed by [[Migration/Design System]], so the whole
design lives in the diff language. Three rules, each load-bearing:

| Meaning | Treatment | Why |
|---|---|---|
| **Hypothetical** | dashed edge + `hatch-hypothetical` | A texture, never a hue: colourblind-safe, needs no dark-mode variant, and doesn't compete with the existing amber/indigo semantics. |
| **This moved** | indigo outline / ring in `--primary` | Used at two scales — around a changed method strip in the rail, and around a changed chip in a row. |
| **Didn't move** | desaturate to `--muted-foreground` | Reaction is signalled by *contrast*, so no fifth colour is needed. |
| **Where it was** | dotted outline + `mark-baseline` | The baseline marks (#137). A texture again, for the same reasons — but *dotted*, because these are drawn inside the dashed hypothetical frame and the two meanings have to read apart. |

Deltas are deliberately **not** red/green — a vote shift is neither good nor bad.
Amber stays reserved for winner/tie, as in `ResultsView`. Every tally, score and
delta is `tabular-nums`: these update live and proportional digits make the rail
jitter.

`hatch-hypothetical` and `mark-baseline` are Tailwind `@utility` rules in
`web-react/src/index.css`.

## The consequence rail

`components/counterfactual/ConsequenceRail.tsx` — the signature element. Four
method strips reacting simultaneously to one edit.

Each strip states **what its method reads off a ballot** ("reads your full
ranking", "reads your top pick only"). This is the educational spine: when a
score edit moves STAR and nothing else, the label has already explained why. It
also makes FPTP's information poverty self-evident.

Order is canonical (Approval → IRV → STAR → FPTP) — RES-01 parity, enforced by
`sortResults`, which is generic over `{ algorithm }` so it sorts the computed
simulation as well as stored rows.

Two rules that are easy to break:

- **A flip is stated in words** ("Ada wins instead of Bo"), not just badged.
- **When a method flips but its headline numbers don't move**, the strip names
  the cause: *"Same first preferences — the outcome moved on later-round
  transfers."* Re-ordering a voter's lower preferences flips IRV without shifting
  a single first preference, so without this the strip reads as a contradiction.
  This is the sharpest lesson the feature has. See `unmovedMetricNote`.

IRV's comparable numbers are **round 1**, not the final round: eliminations mean
the final round holds a different candidate set on each side, so its deltas would
be meaningless.

`variant="compact"` drops the per-candidate numbers — used on the picker, where
the rail is orientation rather than analysis.

**The rail must never unmount while refetching.** Blanking it to a spinner
destroys the comparison the feature exists for; `pending` renders a hairline over
stale-but-visible numbers.

`ConsequenceSummaryBar` is the narrow-viewport companion: on a phone the rail
stacks below the ballot, so this pins the headline to the bottom of the viewport
and jumps to the full rail on tap.

## Screen 1 — the picker

`components/counterfactual/BallotPicker.tsx`, route `/election/:id/explore`.

Every row carries a **fingerprint of the whole ballot** (`BallotFingerprint`):
candidates left-to-right in that ballot's own order, approved ones filled, scores
trailing. A top-choice column was the wrong summary — the leverage in a
counterfactual usually sits in the *second* preference, which such a column
hides. A legend explains the encoding, assembled from what the ballots actually
carry so an approval-only election isn't told about scores it doesn't have.

`ballotSummary` derives the order from whatever the ballot expresses — explicit
ranking, else score order, else approvals first — so all seven templates render
through one path. Unmentioned candidates are appended; dropped ones removed.

**A changed row carries its own diff and its own undo**, so the record of an edit
sits where the edit was made:

```
Nia Sorensen                                    ↶ Undo  ›
  WAS │ ⟨Cy 5⟩   Bo 3    Ada 3
  NOW ┆ ⟨Cy 5⟩  ⟦Ada 3⟧ ⟦Bo 3⟧
```

The `NOW` strip takes the dashed rule; `changedCandidates` marks the chips whose
position, score, **or approval** differs. There is deliberately no sentence
restating it — but that makes the marking purely visual, so the phrasing from
`summarizeChange` moves to an `aria-label` on the strip. **Do not delete that
label.**

A "Changed (n)" filter isolates edited ballots, which makes the list itself the
ledger view.

The candidate chips are **ranked by how many ballots each leads to** and carry
that count (`candidateMatchCounts`, #133) — the most-supported candidate is the
one a reader most likely wants to interrogate, and a chip that leads nowhere
should not sit first. Counts are taken over **every** ballot, not the searched
subset, so the row cannot re-sort under the reader's hands while they type; the
consequence is that a count can exceed what a search leaves visible. Ties keep
the election's own candidate order (`sort` is stable). The count is
parenthesised — "Bo (4)", like the "Changed (n)" chip beside it — because a bare
number in a pill reads as a *score* next to the fingerprint chips below it. It is
`aria-hidden` and restated in each chip's `aria-label` ("Ada, 3 ballots") so it
is not read as part of the name.

Above the chips sits the sentence they complete — "Show ballots whose top choice
was" / "Show ballots that approved" — which is also the group's accessible name
via `aria-labelledby`. It follows the relation toggle, so the toggle explains
itself instead of relying on an `aria-label` no sighted reader ever sees.

The row is an `<li>` with a stretched name button (`after:inset-0`), not one
large button — undo has to be a real sibling control, since nesting a button
inside a button is invalid and unreachable by keyboard.

## Screen 2 — the editor

Route `/election/:id/explore/:voterId`. `CounterfactualBallotView` renders the
scenario's full replacement payload directly: `irv`, `star`, `approval`, and
`fptp` remain independent fields. This differs deliberately from the real voting
screen, where combined templates derive one algorithm's answer from another.
A search answer is already an authoritative hypothetical payload, so deriving it
again would make the editor disagree with the ledger and simulation.

Ranking, score, approval, and FPTP inputs reuse the same low-level controls as
the real ballot. Their values and baseline marks are computed directly from the
working and original payloads. Every user action produces another full payload
and updates the one scenario in `counterfactualStore`; the editor has no private
copy to reconcile with the picker or ledger.

Routes key on **`voterId`, not list index** — the same reasoning that made the
endpoint key overrides on `voter_id`: an index shifts if the list changes
underneath you.

## The edit ledger

`EditLedger` — edits accumulate across voters. It is what makes a counterfactual
reversible and legible, and it is the surface the flip search (below) renders
its answers into: the same chip shape, filled in by the server rather than by
hand. Server-sourced entries carry `source: 'flip'` and render with a sparkle
icon and a "suggested" label.

`variant="summary"` (count + Reset all) on the picker, where rows already carry
their own diffs; full chips on the editor, where there are no rows to carry them.

The working scenario lives in `lib/counterfactualStore.ts`, a small Zustand store
scoped to one election id. The ledger, picker badges, editor controls, simulation
overrides, and consequence rail are all projections of its `edits` payload map;
there is no separate ledger edit versus ballot edit. It survives navigation
between picker and editor, and selecting a different election clears it before
any new override payload is constructed.

## The flip search (#120 server, #135 UI)

`FlipSearchPanel` on the picker screen answers "what would it take to make
someone else the IRV winner?" via the server's `find_flip` search
([[Backend/Simulate Counterfactual]]). Design decisions:

- **Precomputed at close (#146), not run on demand.** The search costs up to
  ~500 ms of server compute for an answer that cannot change — it runs on the
  baseline ballots of a closed election, and both ballot write policies require
  `status = 'open'`. So `compute-results` computes it once when the election
  closes and stores it in `flip_searches` ([[Backend/Edge Function]]).
  `useStoredSearches` reads that row unconditionally (one primary-key read) and
  the panel renders the answer on first paint: no button, no wait.
- **The button is the fallback path only.** `useFlipSearch` still invokes
  `find_flip` live, but it is enabled only once the stored read has provably
  come back empty — elections closed before #146, and elections whose owner
  enabled `public_ballots` after closing. `useStoredSearches` resolves each
  answer to `null` rather than throwing on *any* failure (missing row, denied
  read, missing migration) precisely so all of those degrade to that fallback. The two hooks
  keep distinct query keys so a fallback answer can never masquerade as a
  precomputed one. Both stay separate from `useSimulate`, whose debounce would
  otherwise rerun the search on every ballot edit.
- **Honesty copy mirrors the server contract** (`flipTargetHeadline`):
  "smallest possible change" only when `proven` (k = 1); otherwise "best found …
  a smaller set may exist"; `no_flip_found` says a flip may still exist, never
  "impossible"; `budget_exhausted` blames the search's budget, not the election;
  multiple `winners` reads as *ties for the IRV win*, never *wins*. Targets are
  sorted cheapest-first (k, then total distance); the `best` target gets the
  indigo `--primary` ring and a "Cheapest found" tag — amber stays reserved for
  winner/tie.
- **Changes render read-only** in the ledger's chip shape via `summarizeChange`,
  with per-ballot distance in metric units ("2 swaps" —
  `irv_adjacent_transposition`).
- **Applying replaces the whole scenario.** `applySuggestion` installs the change
  set verbatim as `replace` overrides (the round trip the server's tests
  guarantee) and records that exact map as `activeSuggestion`. Replacement rather than
  merge is deliberate: the search ran on the baseline ballots, so only the
  unmixed set is guaranteed to show the flip through the normal simulate path.
  The button label carries the consent — "Replace my changes with these" when
  the ledger is non-empty. A staleness note appears whenever pending edits
  exist: the answer is relative to the real election, not the current what-if
  state.
- **Suggestion provenance is scenario-level.** The answer is "applied" only
  while the working scenario exactly equals its full change set. Any real user
  mutation anywhere — editing either a suggested or unrelated ballot, undoing,
  or resetting — clears `activeSuggestion` globally. The current working edits
  remain, but none are labelled suggested and the button becomes available
  again. Reapplying replaces everything with the exact original suggestion.
- **Payload-authoritative editor.** Opening a suggested ballot renders the exact
  replacement payload that the ledger and simulation use. The counterfactual
  editor never passes suggestions through voting-template derivation, so an IRV
  edit cannot be discarded by unchanged STAR scores and a future STAR search
  uses the same state path without algorithm-specific synchronization logic.
- **Gating.** The panel renders only when `algorithms` includes `irv` (the
  endpoint 400s otherwise). Within that, the server's input caps (500 ballots,
  20 candidates — mirrored as `FLIP_MAX_*` constants, not imported, to keep the
  shared tabulator out of the entry bundle) are pre-checked client-side and
  explained in place; the raw 400 text remains the error-state backstop.

One accepted rough edge: chip phrases diff the server payload against the
canonicalised original, so a legacy non-canonical stored payload could produce
spurious non-IRV phrases. Real ballots are built by `buildSubmitPayload`, so in
practice the diff is IRV-only.

## The strategic voting search (#149)

`StrategicVotingPanel` answers the individual-voter question: *could this voter
have gotten a better outcome by voting differently?* The full design lives in
[[Features/Strategic Voting]]; what belongs here is how it sits on this screen.

- **Both searches moved above the ballot list.** The issue asks for it, and the
  reason holds up: the searches are the answers, and the ballot list is the tool
  for exploring past them. Strategic voting leads because it is the sharper
  question — what one named person could have done alone, rather than what the
  electorate as a whole would have to do. The DOM order is asserted in both the
  route test and the e2e spec, so a later refactor cannot quietly undo it.
- **Visually more prominent than the flip panel**: a solid `border-border
  bg-card` section against the flip panel's dashed `bg-muted/30` well. Amber
  stays reserved for winner/tie and deltas stay off the red/green axis, per the
  design language above.
- **Same precompute-with-fallback shape** as the flip search, from the same row.
  The results-screen teaser (`ElectionDetail`) reads the **stored** answer only
  and renders nothing without one — it sits on a page every participant loads,
  so it must never cost a server-side search.
- **Grouped by method**, because findings are per method and combining them
  would assert the combined-ballot frame the search exists to reject. A standing
  note under the groups says each finding leaves the other methods as voted.
- **Copy states only how the winner moved** (`strategyHeadline`) and never names
  the strategy — the search proved a better ballot existed, not that the voter
  intended anything. The change itself is spelled out by the shared
  `SuggestionChip`, extracted from the flip panel so a suggested change reads
  identically wherever it comes from.
- **The empty state must not overclaim.** "No strategic voting opportunity
  found. This search can't try every possible ballot, so one may still exist."
  Absence is never proof of a strategy-proof election.
- **Gating is the input caps only** (`STRATEGY_MAX_*`, literals for the same
  bundle reason as `FLIP_MAX_*`). Unlike the flip panel it is not restricted to
  IRV elections — every method has a strategy space.

## Two traps

Both were found by running the prototype, and stage 2 will meet them again.

1. **Seed the editor from the pending hypothetical, not the stored ballot.**
   Seeding from the stored payload makes re-opening an edited ballot silently
   discard the edit.
2. **Diff against a canonicalised original.** Loading a ballot re-derives its
   approval list and ranking from scores, so a round-tripped payload can differ
   from the stored one. Compare against
   `buildSubmitPayload(initialBallotState(...))` of the stored payload, or
   "revert" will never read as "no change". That round trip is `canonicalPayload`
   in `lib/ballotState.ts`, shared with the real Edit Ballot screen, which meets
   the same trap through the baseline marks.

Also: `useBallotState` builds its state once, so the editor **must** be remounted
per voter with `key={voterId}`.

## Gating

Shown only when `status === 'closed' && public_ballots`. Simulation requires
`public_ballots = true` — you cannot re-count ballots you cannot read — and that
flag is locked once an election leaves draft, so elections that didn't opt in are
permanently ineligible ([[Features/Public Ballots]]). When the flag is off, show
a one-line explanation **to the owner only**; it's useful to them next time and
clutter for everyone else.

The entry action sits inside the overall-winner summary card, immediately after
the result it invites the participant to explore. Elections without an overall
summary (a single method or no clear cross-method leader) place it inside the
first/sole algorithm winner card instead, so the eligibility gate never becomes
an accidental visibility gate.

The endpoint **cannot** distinguish "not a participant" from "no such election" —
that's deliberate, and one generic message covers both.

## Endpoint wiring

`useSimulate` in `lib/counterfactual.ts` calls
`supabase.functions.invoke('simulate-counterfactual', …)`. Override changes are
debounced by 250 ms, and TanStack Query keeps the previous response as
placeholder data while the replacement is in flight. The rail therefore stays
mounted and displays its thin pending marker over the last comparison.

The editor sends `useBallotState().getPayload()` directly. That is the same
payload builder as the real ballot flow, including templates D/E/F/G; the
explorer has no second derivation implementation.

The unlinked `/design/explore` prototype remains available for design review.
Both design routes are lazy-loaded so its browser-side shared tabulator stays out
of the production entry bundle.

`e2e/counterfactual-explorer.spec.ts` covers the authenticated two-screen flow,
an edit that changes only IRV's winners, undo, keyboard activation, reduced
motion, and the flip search. Because the spec closes its own election through
`compute-results`, it is also the only end-to-end proof of the #146 precompute:
it asserts the answers appear with no "Run the search" button, then applies one
and checks the rail shows the flip. It snapshots stored `results` rows, public
ballot payloads **and the `flip_searches` row** before the hypothetical edit and
asserts all three are structurally identical afterward — the standing evidence
that this endpoint writes nothing.
