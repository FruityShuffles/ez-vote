# FPTP (First Past The Post)

**Flag:** `election.include_fptp = true`

FPTP is not an entry in `election.algorithms` — it's a boolean flag that overlays an additional vote collection on top of whatever algorithms are selected. This distinction matters: you can't have a FPTP-only election (use Approval for that), but you can add FPTP to any other configuration.

## Why It's a Flag, Not an Algorithm

FPTP is included primarily for educational/comparative purposes — to show how a simple plurality vote would have decided the election differently from ranked or scored methods. The flag approach keeps it clearly secondary and avoids having it appear as a peer to IRV/STAR/Approval in the UI.

## Explaining It to Organizers

The toggle is the only one of the create screen's four settings defaulted **on**, so it affects nearly every election and has to be understandable without prior knowledge (#112):

- The create/edit screen (`web-react/src/routes/ElectionForm.tsx`) labels it "Include first-past-the-post (FPTP) comparison" — the acronym is never bare — and its description ends in a "What's this?" link. The link adds `?learn=fptp` to the current pathname and opens `LearnContent` in place, so an organizer can consult the explainer without abandoning an unsaved form. Closing uses the link's explicit history-origin marker, with a same-path fallback for direct deep links.
- `/learn` (`web-react/src/routes/Learn.tsx`) carries a fourth **FPTP** tab alongside Approval/IRV/STAR, in the same strengths/weaknesses/how-it-works shape. It sits last, matching `RESULT_ALGORITHM_ORDER` in `web-react/src/lib/results.ts` and the "clearly secondary" reasoning above; the default tab is still Approval.
- That tab's copy is net-new rather than ported from the frozen Flutter learn screen, and it says explicitly that EZVote never *runs* an FPTP election — it reinterprets ballots already cast.

Standalone Learn tabs are selected by the `?algo=` query param (`approval` | `irv` | `star` | `fptp`), falling back to Approval on anything unrecognized, so any surface can deep link to a method. The form dialog uses the same keys under `?learn=` on `/create` or `/election/:id/edit`, and re-stamps its history-origin marker when the selected method changes. The dashboard embeds `LearnContent` uncontrolled and is unaffected.

## Per-Template Behavior

| Template | How FPTP is collected |
|---|---|
| B (STAR only) | Auto-derived from top scorer; picker shown if tied or overrideable |
| C (Approval only) | Explicit single-choice picker from approved candidates |
| E (STAR + Approval) | Auto-derived from top scorer; same as Template B |
| A, D, F, G | Not collected — IRV first-choice used as FPTP in edge function |

For Templates A, D, F, G (those with IRV), no FPTP UI is shown. The edge function computes FPTP by falling back to `payload.irv[0]` (the voter's first-ranked candidate). This means IRV-enabled elections get FPTP "for free" without any extra UI burden on the voter.

## Auto-Selection Logic (Templates B, E)

`autoFptpFromScores` (`supabase/functions/_shared/derive.ts`) runs after every score change:

```
topScore = max score across all candidates (0 means "no top set")
topCandidates = candidates where score == topScore

If exactly one top candidate:
  auto-set fptpChoice = that candidate's id

If multiple candidates tied at top:
  if the current fptpChoice is one of the tied candidates: leave it
  otherwise: clear fptpChoice (voter must choose)

If fptpChoice was set but is no longer in the top set:
  clear fptpChoice
```

The FPTP picker is only shown to the voter when there's a tie requiring manual resolution. For unambiguous top scorers, the auto-selection is silent.

## Payload Key

When FPTP is collected, the ballot payload includes:
```json
{ "fptp": "candidate-uuid" }
```

The edge function reads this key directly. If absent (IRV-derived case), it falls back to `payload.irv[0]`. See [[Edge Function]] → FPTP algorithm.

## Migration

Added in migration 017: `ALTER TABLE elections ADD COLUMN include_fptp boolean DEFAULT false`.
