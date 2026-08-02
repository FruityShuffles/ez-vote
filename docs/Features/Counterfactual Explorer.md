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

Deltas are deliberately **not** red/green — a vote shift is neither good nor bad.
Amber stays reserved for winner/tie, as in `ResultsView`. Every tally, score and
delta is `tabular-nums`: these update live and proportional digits make the rail
jitter.

`hatch-hypothetical` is a Tailwind `@utility` in `web-react/src/index.css`.

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

Route `/election/:id/explore/:voterId`. `HypotheticalBallot` wraps the existing
`BallotView` with the dashed/hatched provisional treatment. `BallotView` is
already fully driven by `useBallotState`, so the seven templates, tie-break drag
order and auto-score-zero behaviour come for free and cannot drift from the real
voting screen.

Routes key on **`voterId`, not list index** — the same reasoning that made the
endpoint key overrides on `voter_id`: an index shifts if the list changes
underneath you.

## The edit ledger

`EditLedger` — edits accumulate across voters. It is what makes a counterfactual
reversible and legible, and it is where the deferred flip search (**#120**) will
render its answer: the same shape, filled in by the server rather than by hand.

`variant="summary"` (count + Reset all) on the picker, where rows already carry
their own diffs; full chips on the editor, where there are no rows to carry them.

The ledger lives in `lib/counterfactualStore.ts`, a small Zustand store scoped to
one election id. It survives navigation between picker and editor, and selecting
a different election clears it before any new override payload is constructed.

## Two traps

Both were found by running the prototype, and stage 2 will meet them again.

1. **Seed the editor from the pending hypothetical, not the stored ballot.**
   Seeding from the stored payload makes re-opening an edited ballot silently
   discard the edit.
2. **Diff against a canonicalised original.** Loading a ballot re-derives its
   approval list and ranking from scores, so a round-tripped payload can differ
   from the stored one. Compare against
   `buildSubmitPayload(initialBallotState(...))` of the stored payload, or
   "revert" will never read as "no change". See `canonicalPayload` in
   `routes/DesignExplore.tsx`.

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
an edit that changes only IRV's winners, undo, keyboard activation, and reduced
motion. It snapshots stored `results` rows and public ballot payloads before the
hypothetical edit and asserts both are structurally identical afterward.
