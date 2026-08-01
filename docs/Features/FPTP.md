# FPTP (First Past The Post)

**Flag:** `election.include_fptp = true`

FPTP is not an entry in `election.algorithms` — it's a boolean flag that overlays an additional vote collection on top of whatever algorithms are selected. This distinction matters: you can't have a FPTP-only election (use Approval for that), but you can add FPTP to any other configuration.

## Why It's a Flag, Not an Algorithm

FPTP is included primarily for educational/comparative purposes — to show how a simple plurality vote would have decided the election differently from ranked or scored methods. The flag approach keeps it clearly secondary and avoids having it appear as a peer to IRV/STAR/Approval in the UI.

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
