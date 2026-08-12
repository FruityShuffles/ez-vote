# Ballot Templates

`web-react/src/components/ballot/BallotView.tsx` dispatches one of 7 templates based on which algorithms the election has enabled. See [[Ballot State Machine]] for the internal state and algorithms that power these templates.

## Template Dispatch

The template letter is computed by `getTemplate(algorithms)` in `web-react/src/lib/ballotState.ts` from the combination of algorithms in `election.algorithms`; `BallotView` then `switch`es on it. FPTP is a flag (`election.include_fptp`), not an algorithm entry — it's always additive.

| Template | Algorithms | FPTP possible? | Renders |
|---|---|---|---|
| A | IRV only | No | `RankList` |
| B | STAR only | Yes | `ScoreCard` |
| C | Approval only | Yes | `ApprovalCard` |
| D | IRV + Approval | No | `RankList` + `TopKStepper` |
| E | STAR + Approval | Yes | `ScoreCard` + `CutoffStepper` |
| F | STAR + IRV | No | `ScoredSortableList` |
| G | STAR + IRV + Approval | No | `ScoredSortableList` + `TopKStepper` |

All of the sub-views listed above are internal to `BallotView.tsx`. They compose four shared input components in the same directory:

| Component | Role |
|---|---|
| `SortableList.tsx` | dnd-kit drag-and-drop list (`SortableList` + `SortableRow`), with keyboard-accessible reordering |
| `ScoreChips.tsx` | the 0–5 score selector, rendered as real radio inputs |
| `Stepper.tsx` | the numeric stepper behind "approve top N" and "approve score ≥ N" |
| `FptpPicker.tsx` | single-choice FPTP selector, restricted to eligible candidates |

## Template A — IRV Only

**UI:** `SortableList` with numbered position badges and drag handles.

**Interaction:** User drags candidates to set rank order. Rankings are direct — no derivation.

**State used:** `state.rankings`; reordering calls `ballot.reorderRanking(from, to)`

**Payload produced:**
```json
{ "irv": ["id1", "id2", "id3"] }
```

## Template B — STAR Only

**UI:** `ScoreChips` (0–5) per candidate in a flat, non-reorderable list.

**Interaction:** User picks a chip to set a score. Scores are direct. FPTP auto-selects the top-scored candidate if unambiguous.

**State used:** `state.scores`; FPTP uses `state.fptpChoice`

**Payload produced:**
```json
{ "star": { "id1": 3, "id2": 5 }, "fptp": "id2" }
```

## Template C — Approval Only

**UI:** Checkbox list per candidate.

**Interaction:** User checks candidates they approve of. FPTP is a separate single-choice selector among approved candidates.

**State used:** `state.approvals`; FPTP uses `state.fptpChoice`

**Payload produced:**
```json
{ "approval": ["id1", "id3"], "fptp": "id1" }
```

## Template D — IRV + Approval

**UI:** `SortableList` ranked list + a `Stepper` ("Approve top N"). Approved rows carry an "Approved" badge.

**Interaction:** User ranks candidates by dragging. Approvals are automatically derived as the top K candidates in the ranking (where K is set by the stepper). User does not check individual boxes — they set a cutoff position.

**State used:** `state.rankings`, `state.approvalTopK`

**Derivation:** `deriveApprovalsFromRanking` — the first `approvalTopK` ids of the ranking.

**Payload produced:**
```json
{ "irv": ["id1", "id2", "id3"], "approval": ["id1", "id2"] }
```

## Template E — STAR + Approval

**UI:** `ScoreChips` per candidate + a `Stepper` threshold ("Approve score ≥ N").

**Interaction:** User scores candidates. Approvals are automatically derived as all candidates with score ≥ cutoff. FPTP auto-selects from the top scorer.

**State used:** `state.scores`, `state.approvalCutoff`, `state.fptpChoice`

**Derivation:** `deriveApprovalsFromScores` — every candidate whose score ≥ `approvalCutoff`.

**Payload produced:**
```json
{ "star": { "id1": 4, "id2": 2 }, "approval": ["id1"], "fptp": "id1" }
```

## Template F — STAR + IRV

**UI:** `ScoredSortableList` — a `SortableList` where each row shows the candidate name plus its `ScoreChips`. The list is sorted by score descending; within a score tie, order is manually adjustable by dragging.

**Interaction:** User assigns scores via chips. The IRV ranking is derived from the score-sorted order. User can drag candidates within a tie group to break ties for IRV purposes; rows animate to their new position as scores change.

**State used:** `state.scores`, `state.tieBreaks`; reordering calls `ballot.reorderScored(activeId, overId)`

**Derivation:** `deriveRanking` sorts by score desc → tie-break order → original candidate order. The displayed order is `ballot.displayOrder`.

**Payload produced:**
```json
{ "star": { "id1": 5, "id2": 3 }, "irv": ["id1", "id2"] }
```

## Template G — STAR + IRV + Approval

**UI:** Same as Template F (score chips in a sortable list) + the top-K `Stepper` from Template D.

**Interaction:** User assigns scores; the IRV ranking is derived from score order; approvals are derived as the top K of the derived ranking.

**State used:** `state.scores`, `state.tieBreaks`, `state.approvalTopK`

**Derivation:** ranking from `deriveRanking`, then approvals as the first `approvalTopK` of that ranking.

**Payload produced:**
```json
{ "star": { "id1": 5, "id2": 3 }, "irv": ["id1", "id2"], "approval": ["id1"] }
```

## FPTP in Templates

FPTP is never a separate algorithm type in `election.algorithms`. It's controlled by `election.include_fptp`. When enabled:

- **Templates B, E**: Auto-select the top-scored candidate as FPTP if there is no score tie at the top. The `FptpPicker` is shown with the tied top scorers as eligible options so the voter can resolve or override.
- **Template C**: `FptpPicker` restricted to the currently-approved candidates.
- **Templates A, D, F, G**: FPTP not applicable (IRV already captures first-choice intent). `buildSubmitPayload` refuses to emit an `fptp` key for these templates even if a choice is somehow set (BAL-06).

If the auto-selected FPTP candidate later gets outscored or a new tie appears, `autoFptpFromScores` clears the selection.

## Zero-Approval Warning

Applies to templates C, D, E, G — any template that produces an `approval` payload key.

If the user submits with zero approvals (`hasZeroApprovals`):

1. First attempt: flash the approval section, return without submitting.
2. Second attempt: allow submit (user's confirmed intent via silence).
3. The "already warned" flag is a `ref` in `Ballot.tsx`, so it resets each ballot session.

This is a UX guardrail, not a hard constraint — zero approvals is technically valid. Distinct from the *blocking* errors in `getBlockingErrors` (all-zero STAR scores; a missing FPTP pick on B/C/E), which surface as an error toast and never submit.

## Baseline Marks (#137)

When the ballot on screen already exists, `BallotView` takes an optional `marks`
prop and shadows every control the voter has moved with a dotted outline sitting
on the value they actually cast. `routes/Ballot.tsx` supplies these template-aware
marks while editing a real vote. The what-if editor has a separate payload-level
marking path because counterfactual replacements must preserve independently
suggested algorithm fields rather than re-run the real ballot's derivation rules
([[Features/Counterfactual Explorer]]).

The rules live in `web-react/src/lib/ballotBaseline.ts`, pure and React-free:

- **The mark is a diff, not a decoration.** A freshly-opened ballot carries no
  marks; a mark appears when a control leaves what was cast and disappears the
  moment it is put back. This is why the baseline payload must be canonicalised
  first (`canonicalPayload` in `ballotState.ts`) — loading a ballot re-derives its
  approvals and ranking, so without the round trip a restored value would stay
  marked.
- **Mark only what the voter manipulates directly.** Derived values are marked at
  their source control, never on every row they touch.

| Control | Templates | Mark |
|---|---|---|
| `ScoreChips` | B/E/F/G | Dotted outline on the chip holding the original score |
| `PositionBadge` | A/D always; F/G only for a tie-break drag | A hollow `GhostBadge` carrying the original position |
| Approval `Checkbox` | C | Dotted ring on the box, plus a ghost tick when it was originally approved |
| `FptpPicker` radios | C always; B/E only while no score has moved | Dotted outline on the originally-picked row |
| `TopKStepper` / `CutoffStepper` | D/G / E | `GhostBadge` with the original number |

The F/G position rule is the subtle one. A score change reshuffles the whole
list, so badging every displaced row would bury the one thing that moved; the
marks isolate a drag *within* a tie group by comparing relative order inside each
original score group, ignoring candidates whose score changed. FPTP follows the
same shape: in B/E the pick is re-derived by `autoFptpFromScores`, so a pick that
moved because a score moved is marked at the score chip.

Marks are visual only — there are no captions — so each carries `sr-only` text or
an extended `aria-label` ("was 3rd", "4, your original score", "Alice, was
approved"), and `data-baseline="true"` for tests. The `mark-baseline` utility in
`index.css` is deliberately **dotted**, distinct from the dashed edge that means
*hypothetical* in the explorer, since the two are drawn on top of each other
there.

`BallotChangeBanner` sits above the ballot on both screens: a count of the marked
controls plus an undo that re-seeds the working ballot via `useBallotState`'s
`reset`.

## View-Only Mode

`BallotView` takes a `viewOnly` flag, set by `Ballot.tsx` when `election.status === 'closed'`. Because the component is stateless, it renders the identical layout with every input disabled — the existing ballot shown for review (BAL-16). This is reached from the election detail surface as "View Ballot". No `marks` are passed in view-only mode or on the public-ballot route: nothing has been changed, so nothing is marked.

The related route `/election/:id/ballot/:index` (`routes/PublicBallot.tsx`) renders another voter's ballot the same way when the election has `public_ballots` enabled — see [[Features/Public Ballots]].
