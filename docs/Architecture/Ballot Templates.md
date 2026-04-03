# Ballot Templates

`lib/presentation/screens/ballot_screen.dart` dispatches one of 7 templates based on which algorithms the election has enabled. See [[Ballot State Machine]] for the internal state and algorithms that power these templates.

## Template Dispatch

The template is determined by the combination of algorithms in `election.algorithms`. FPTP is a flag (`election.includeFptp`), not an algorithm entry — it's always additive.

| Template | Algorithms | FPTP possible? |
|---|---|---|
| A | IRV only | No |
| B | STAR only | Yes |
| C | Approval only | Yes |
| D | IRV + Approval | No |
| E | STAR + Approval | Yes |
| F | STAR + IRV | No |
| G | STAR + IRV + Approval | No |

## Template A — IRV Only

**UI:** `ReorderableListView` with numbered circle avatars and drag handles.

**Interaction:** User drags candidates to set rank order. Rankings are direct — no derivation.

**State used:** `_rankings` (ordered list of candidate IDs)

**Payload produced:**
```json
{ "irv": ["id1", "id2", "id3"] }
```

## Template B — STAR Only

**UI:** Score chips (0–5) per candidate, displayed as a `ChoiceChip` row.

**Interaction:** User taps a chip to set score. Scores are direct. FPTP auto-selects the top-scored candidate if unambiguous.

**State used:** `_scores`; FPTP uses `_fptpChoice`

**Payload produced:**
```json
{ "star": { "id1": 3, "id2": 5 }, "fptp": "id2" }
```

## Template C — Approval Only

**UI:** Checkbox list per candidate.

**Interaction:** User checks candidates they approve of. FPTP is a separate single-choice selector among approved candidates.

**State used:** `_approvals`; FPTP uses `_fptpChoice`

**Payload produced:**
```json
{ "approval": ["id1", "id3"], "fptp": "id1" }
```

## Template D — IRV + Approval

**UI:** Reorderable ranked list + a numeric stepper ("Approve top N").

**Interaction:** User ranks candidates by dragging. Approvals are automatically derived as the top K candidates in the ranking (where K is set by the stepper). User does not check individual boxes — they set a cutoff position.

**State used:** `_rankings`, `_approvalTopK`

**Derivation:** `_approvals = _rankings.take(_approvalTopK).toSet()`

**Payload produced:**
```json
{ "irv": ["id1", "id2", "id3"], "approval": ["id1", "id2"] }
```

## Template E — STAR + Approval

**UI:** Score chips per candidate + a score-threshold stepper ("Approve score ≥ N").

**Interaction:** User scores candidates. Approvals are automatically derived as all candidates with score ≥ cutoff. FPTP auto-selects from top scorer.

**State used:** `_scores`, `_approvalCutoff`, `_fptpChoice`

**Derivation:** `_approvals = candidates.where((c) => _scores[c.id]! >= _approvalCutoff).toSet()`

**Payload produced:**
```json
{ "star": { "id1": 4, "id2": 2 }, "approval": ["id1"], "fptp": "id1" }
```

## Template F — STAR + IRV

**UI:** `ReorderableListView` where each item shows the candidate name + score chips below it. The list is sorted by score descending; within a score tie, order is manually adjustable.

**Interaction:** User assigns scores via chips. IRV ranking is derived from the score-sorted order. User can drag candidates within a tie group to break ties for IRV purposes. Animated slides show candidates repositioning as scores change.

**State used:** `_scores`, `_tieBreaks`, `_slideOffsets`

**Derivation:** `_deriveRanking()` sorts by score desc → tie-break order → original candidate order

**Payload produced:**
```json
{ "star": { "id1": 5, "id2": 3 }, "irv": ["id1", "id2"] }
```

## Template G — STAR + IRV + Approval

**UI:** Same as Template F (score chips in reorderable list) + the top-K stepper from Template D.

**Interaction:** User assigns scores; IRV ranking derived from score order; approvals derived as top K of derived ranking.

**State used:** `_scores`, `_tieBreaks`, `_slideOffsets`, `_approvalTopK`

**Derivation:** ranking from `_deriveRanking()`, then approvals from `_rankings.take(_approvalTopK)`

**Payload produced:**
```json
{ "star": { "id1": 5, "id2": 3 }, "irv": ["id1", "id2"], "approval": ["id1"] }
```

## FPTP in Templates

FPTP is never a separate algorithm type in `election.algorithms`. It's controlled by `election.includeFptp`. When enabled:

- **Templates B, E**: Auto-select the top-scored candidate as FPTP if no score tie at the top. Show a picker if tied or if user wants to override.
- **Template C**: Show a single-choice picker restricted to approved candidates.
- **Templates A, D, F, G**: FPTP not applicable (IRV already captures first-choice intent).

If the auto-selected FPTP candidate later gets outscored or there's a new tie, `_autoFptpFromScores` clears the selection.

## Zero-Approval Warning

Applies to templates C, D, E, G — any template that produces an `approval` payload key.

If the user submits with zero approvals:
1. First attempt: show a warning, return without submitting. Set `_warnedZeroApprovals = true`.
2. Second attempt: allow submit (user's confirmed intent via silence).
3. Flag resets each ballot session.

This is a UX guardrail, not a hard constraint — zero approvals is technically valid.

## View-Only Mode

`BallotScreen` accepts an `initialBallot` param and a `viewOnly` flag. When `viewOnly = true`, all inputs are disabled and the screen renders the existing ballot for review. This is used from `ElectionDetailScreen` to let a voter review their submitted ballot.
