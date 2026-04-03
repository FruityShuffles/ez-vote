# Client-Side Ballot Derivation

## What Gets Derived Client-Side

In templates where multiple algorithm outputs are collected simultaneously, some outputs are derived from others rather than directly input by the user:

| Template | Derived field | Derived from |
|---|---|---|
| D (IRV + Approval) | `approval` | Top-K of `irv` ranking |
| E (STAR + Approval) | `approval` | Scores ≥ cutoff |
| F (STAR + IRV) | `irv` | Score-sorted order with tie-breaks |
| G (STAR + IRV + Approval) | `irv` | Score-sorted order with tie-breaks |
| G (STAR + IRV + Approval) | `approval` | Top-K of derived `irv` ranking |

The derived values are computed in `BallotScreen` immediately before `upsertBallot()` is called. The edge function receives the final derived values as explicit fields — it treats all payload fields as direct inputs.

## Why Not Derive Server-Side

**Tie-break order can't be recovered from scores alone.** In Templates F and G, a voter who has scored three candidates at 4 points each and dragged them into a specific order has expressed a preference that only exists in the client's `_tieBreaks` map. If the server re-derived IRV ranking from scores, it would produce an arbitrary order for tied candidates (e.g., alphabetical or by database insertion order), discarding the voter's explicit preference.

**The server doesn't know which derivation rule applies.** Template D derives approval as top-K of ranking. Template G also derives approval from ranking, but with a different K. Template E derives approval from a score cutoff. These rules live in the UI, not in the database schema — the edge function would need to know which template the voter used to re-derive correctly.

**Keeping derivation in the client is simpler and more honest.** The ballot payload is a record of the voter's expressed preferences in the form the algorithms expect. Letting the client build that payload explicitly makes the edge function a pure function over its inputs, with no hidden re-computation.

## Consistency Guarantee

Because derivation runs immediately before submission (not during input), the submitted payload is always consistent with the current UI state. There's no race condition between user interaction and derived values.

The pre-submit candidate change gate (see [[Ad-Hoc Candidates]]) runs before derivation, ensuring the candidate list used for derivation matches what the server has.
