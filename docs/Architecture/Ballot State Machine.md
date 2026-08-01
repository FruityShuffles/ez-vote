# Ballot State Machine

Internal state and algorithms for the voting flow. See [[Ballot Templates]] for what each template looks like to the user.

The logic is split across three layers, deliberately:

| Layer | File | Role |
|---|---|---|
| Derivation | `supabase/functions/_shared/derive.ts` | Pure, runtime-agnostic rules — ranking, approvals, tie-breaks, drag auto-scoring, FPTP auto-select, payload assembly |
| Transitions | `web-react/src/lib/ballotState.ts` | Pure, React-free `BallotState` + one function per user action; orchestrates which derivation runs for which template |
| Binding | `web-react/src/lib/useBallotState.ts` | Holds the state in `useState`, exposes named handlers; `web-react/src/routes/Ballot.tsx` owns submission and polling |

> **Why derivation is separate:** the derived `irv` / `approval` fields decide what gets *submitted*, making derivation a second algorithm source of truth alongside tabulation. It lives in `_shared/derive.ts` — importable from any TS runtime — and is locked by the golden fixtures in `supabase/functions/_shared/fixtures/derivation/`, run in CI by `.github/workflows/tabulate-tests.yml`. Nothing derives inline in a component. See [[Decisions/Client-Side Derivation]].

## State

`BallotState` in `ballotState.ts` — a plain immutable object; every transition returns a new one.

```ts
interface BallotState {
  scores: Scores              // STAR: score 0–5 per candidate id (source of truth when STAR is present)
  rankings: string[]          // IRV-only templates (A/D): direct preference order, index 0 = rank 1
  approvals: string[]         // Approval-only template (C): approved candidate ids
  fptpChoice: string | null   // FPTP: single selected candidate id (templates B/C/E)

  approvalCutoff: number      // Template E: approve candidates with score >= this (default 3)
  approvalTopK: number        // Templates D/G: approve this many top-ranked (default 0)

  tieBreaks: TieBreaks        // Templates F/G: score → ordered ids tied at that score
}
```

Note what is *absent*: there is no separate ranking field for STAR+IRV templates. In F/G the ranking is always derived from `scores` + `tieBreaks` on read (`displayRanking`), never stored. Row animation is handled by dnd-kit rather than tracked offsets.

## Initialization — `initialBallotState(candidateIds, algos, payload?)`

Called once from `useBallotState`'s lazy `useState` initializer.

1. Seed defaults: scores 0 for every candidate when STAR is present, rankings in candidate position order when IRV is present without STAR, empty approvals, cutoff 3, top-K 0.
2. If a saved `payload` exists (editing, or viewing an existing/public ballot), rehydrate **every** field from it — scores, ranking, approvals, and FPTP (BAL-08, the #39 regression). Candidates added since the ballot was saved are folded in at score 0 / appended; deleted ones are dropped (BAL-09).
3. Approval state is recovered indirectly, because only the *result* is stored:
   - Template C — restore the approved ids directly.
   - Template E — recover `approvalCutoff` as the minimum score among approved candidates.
   - Templates D/G — recover `approvalTopK` as the count of approved candidates.
4. For STAR templates, restore `tieBreaks` from the saved `irv` order via `rebuildTieBreaksFromOrder`, so view-only mode shows exactly what was submitted and an untouched re-submit cannot silently flip a tie.

> **Recorded divergence (BAL-03).** The original Flutter implementation rebuilt tie-breaks from candidate order at this point, discarding the voter's saved order. React restores it. This is an accepted, intentional difference — see [[Migration/Parity Checklist]].

## `syncTieBreaks(tieBreaks, scores, candidateIds)`

Runs after every score change. Maintains `tieBreaks` so it reflects the current tie groups:

```
For each score value that appears more than once:
  If a tie-break entry already exists for that score:
    Append any newly-tied candidates, then drop candidates no longer at that score
    (preserving the order of those that remain)
  Else:
    Create a new entry with the candidates in current display order
Remove entries for scores that are no longer tied
Exclude score-0 ties (zero-scored candidates don't need tie-breaking for IRV)
```

Score-0 candidates are always placed at the bottom of the derived ranking in natural candidate order — no tie-break UI needed.

## `rebuildTieBreaksFromOrder(order, scores)`

Rebuilds the entire tie-break map from an explicit display order rather than incrementally patching it. Groups by score **including score 0**, keeping any group with 2+ members. Used after a drag reorder in templates F/G, and when restoring a saved ballot.

## Drag-reorder score adjustment — `applyReorder`

When the user drags a candidate in templates F/G, `reorderScored` maps the dnd-kit endpoints onto list indices and calls `applyReorder`, which picks one of two branches before rebuilding tie-breaks:

```
draggedScore = scores[draggedId] ?? 0
aboveIds     = reordered[0 .. newIndex)
hasZeroAbove = any id in aboveIds with score 0

If draggedScore == 0 and not hasZeroAbove:
  // 0-score candidate placed above every other 0-score candidate:
  // bump it to the highest value that doesn't tie any candidate above.
  newScore = aboveIds.isEmpty
               ? 5
               : clamp(min(aboveIds.scores) - 1, 0, 5)
Else:
  // Already-scored candidate (or 0-score still below other 0s):
  // keep the dragged score consistent with its new neighbours.
  aboveScore = newIndex > 0 ? scores[reordered[newIndex - 1]] : 5
  belowScore = newIndex < len - 1 ? scores[reordered[newIndex + 1]] : 0
  newScore = clamp(draggedScore, belowScore, aboveScore)
```

The first branch supports the "rank first, score later" workflow (#83): a voter can drag every candidate into preference order before assigning any scores, and each drag implicitly produces a descending score (5, 4, 3, …) that survives the next resort.

`applyReorder` takes a raw insertion index that it decrements when moving downward; `reorderScored` converts dnd-kit's final target index into that form before calling it.

## `deriveRanking(scores, tieBreaks, candidateIds)`

Produces the IRV ranking for templates F and G. Surfaced to the UI as `ballot.displayOrder`.

```
Sort candidates by:
  1. Score descending (higher score = higher rank)
  2. Within the same score: order from tieBreaks[score] (the user's manual preference),
     with any missing members appended in candidate order
  3. Within score 0 (no tie-break): original candidate list order
```

## `deriveApprovalsFromScores` / `deriveApprovalsFromRanking`

- **From scores** (template E): every candidate id whose score ≥ `approvalCutoff`, in candidate order.
- **From ranking** (templates D and G): the first `approvalTopK` ids of the current ranking.

## `autoFptpFromScores(scores, candidateIds, currentChoice)`

Used in templates B and E (STAR-enabled templates with FPTP), re-run on every score change by `setScore`.

```
top = candidates at the nonzero maximum score (empty if the max is 0)

If top.length == 1:
  → top[0]                          // unambiguous top scorer
Else if currentChoice is set and no longer in top:
  → null                            // was top scorer, no longer is
Else:
  → currentChoice                   // preserve the user's explicit choice, or leave null
```

Being a pure function of the new scores, it needs no post-frame deferral.

## `mergeCandidates(state, freshCandidateIds, algos)`

Folds a refreshed candidate list into in-progress state without discarding the voter's work (BAL-10):

```
For each new id:
  scores[newId] = 0
  rankings.push(newId)              // new candidates go to the bottom of the ranking
  // Never auto-approved — the voter must approve explicitly

For each removed id:
  delete from scores, rankings, approvals
  if fptpChoice == removedId: fptpChoice = null
  (tie-break groups are rebuilt by syncTieBreaks, which drops departed members)

syncTieBreaks()
```

## Candidate Polling (Ad-Hoc Elections)

Driven from `routes/Ballot.tsx`. When `election.allow_voter_candidates` is true and the election is open and not view-only:

1. `useCandidateCount` polls the count on a 10s TanStack Query `refetchInterval` — lightweight, counts ids only.
2. When the polled count differs from the loaded candidate list length, invalidate `electionKeys.candidates(id)` to trigger a full fetch, and toast the voter.
3. A separate effect watches the candidate **ids** (joined as a key, not a count) and calls `merge` whenever they change — so the ballot resyncs however the list changed: the poll above, a background refetch on window focus, or the pre-submit gate's `setQueryData`.

Counts-first avoids a loading-state flash on every poll tick when nothing changed. See [[Features/Ad-Hoc Candidates]].

## Pre-Submit Gate

On submit, before building the payload (only when the election allows voter candidates):

1. Re-fetch the current candidate list from the DB (`fetchCandidates`).
2. If it differs from the loaded list, push it into the query cache, warn, and return **without** submitting. The sync effect merges it.
3. The voter reviews the updated ballot and submits again.

This prevents a ballot from being submitted against stale candidate data (BAL-11).

## Payload Construction — `buildSubmitPayload`

Delegates to `buildPayload` in `derive.ts`, which assembles per template:

```
if (star):     payload.star     = { id: score }
if (irv):      payload.irv      = rankings          // A/D direct
                                 | deriveRanking()  // F/G derived
if (approval): payload.approval = approvals         // C direct
                                 | deriveApprovalsFromScores()   // E
                                 | deriveApprovalsFromRanking()  // D/G
if (fptp):     payload.fptp     = fptpChoice
```

FPTP is emitted **only** for templates B/C/E. `buildSubmitPayload` gates on the template before passing the flag through, so a score-driven `fptpChoice` can never leak into an IRV template's payload (BAL-06).

## Ballot Change Detection

On edit submit, the new payload is compared to the saved one with `payloadsEqual` (`lib/ballot.ts`). If identical, the realtime compute call is skipped — this prevents redundant edge-function calls when a voter opens and re-submits without changing anything (BAL-13).

## Submit Flow

`onSubmit` in `routes/Ballot.tsx`:

```
1. Zero-approval soft warning: flash the approval section once, return (BAL-12)
2. Hard validation: getBlockingErrors → error toast, return
3. Pre-submit candidate gate: refresh + warn + return if candidates changed
4. Build payload; compare against the saved one
5. useUpsertBallot.mutateAsync(payload)
6. If realtime_results && payload changed:
     triggerRealtimeCompute(electionId)     // fire-and-forget
7. Toast success; navigate to /election/:id
```

Step 6 is not awaited and its errors are swallowed — a failure to compute realtime results must not fail the ballot submission. The mutation's `onSuccess` invalidates the existing-ballot and ballot-count queries.
