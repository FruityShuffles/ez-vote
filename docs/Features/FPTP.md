# FPTP (First Past The Post)

**Flag:** `election.include_fptp = true`

FPTP is not an entry in `election.algorithms` — it's a boolean flag that overlays an additional vote collection on top of whatever algorithms are selected. This distinction matters: you can't have a FPTP-only election (use Approval for that), but you can add FPTP to any other configuration.

## Why It's a Flag, Not an Algorithm

FPTP is included primarily for educational/comparative purposes — to show how a simple plurality vote would have decided the election differently from ranked or scored methods. The flag keeps that asymmetry enforceable: an election always has at least one *real* method, and FPTP is layered on top of the ballots those methods collected. The create screen presents it alongside the other three (#130), but the data model never lets it stand alone.

## Explaining It to Organizers

FPTP is on by default, so it affects nearly every election and has to be understandable without prior knowledge (#112):

- The create/edit screen (`web-react/src/routes/ElectionForm.tsx`) shows it as the fourth checkbox in the **Voting Algorithms** group, below Approval/IRV/STAR (#130) — it was previously a switch marooned among the unrelated Settings toggles. The label reads "First Past the Post (FPTP) comparison": the acronym is never bare, and "comparison" carries the secondary framing that the old placement carried structurally. The checkbox is still bound to `include_fptp`, never to `algorithms`, and validation requires at least one of Approval/IRV/STAR — so checking FPTP alone is rejected with "Select at least one of Approval, IRV, or STAR".
- The section heading carries a "What's the difference?" link (formerly a per-option "What's this?" on the FPTP row). It adds `?learn=approval` to the current pathname and opens `LearnContent` in place, so an organizer can consult the explainer without abandoning an unsaved form; `?learn=fptp` and the other keys still resolve, so older deep links keep working. Closing uses the link's explicit history-origin marker, with a same-path fallback for direct deep links.
- `/learn` (`web-react/src/routes/Learn.tsx`) carries a fourth **FPTP** tab alongside Approval/IRV/STAR, in the same strengths/weaknesses/how-it-works shape. It sits last, matching `RESULT_ALGORITHM_ORDER` in `web-react/src/lib/results.ts` and the "clearly secondary" reasoning above; the default tab is still Approval.
- That tab's copy is net-new rather than ported from the frozen Flutter learn screen. **`howItWorks` is the only section that mentions EZVote** — it is where the "we never *run* an FPTP election, we reinterpret ballots already cast" point lives, and it is not repeated elsewhere.
- **The FPTP tab is deliberately not balanced (#129).** It carries **one** strength, **five** weaknesses, and a closing **"The Verdict"** section that no other method has (the optional `verdict` field on `AlgoInfo`, rendered by `AlgorithmCard` only when present). The original three-and-three shape matched Approval/IRV/STAR and therefore read as an even trade-off between four comparable options, which is the opposite of what the page exists to convey.

  Two of the original three strengths were **demoted on purpose and should not be restored**: "trivial to count and audit" and "produces a decisive result" are both true of FPTP, but equally true of approval voting — a single pass of tally marks, precinct-summable, settled without further rounds. Neither is an advantage of FPTP *over the methods it sits beside*, and listing them as strengths implied FPTP buys something the alternatives don't. Familiarity is the only advantage unique to it, so it is the only one the tab claims; the counting/decisiveness point survives inside that entry as an explicit "approval matches this" concession.

  **Three rules govern the `summary` and `verdict`**, which are the first and last things a reader sees and therefore the two that stick. A `Learn.test.tsx` case enforces the first two:

  1. *No product framing.* Both are about voting, not about EZVote. The first pass at #129 spent the summary and the closing section explaining the comparison toggle — so the tab said "we don't really run FPTP" three times and never said plainly what FPTP does to an election.
  2. *No jargon.* "Plurality" and "majority rule" are out; the copy says "the most marks", "one candidate", "split". A general reader is the audience.
  3. *Argue from cost to the voter, not from FPTP's pedigree.* Drafts that led on FPTP being undesigned/inherited were abstract, contestable, and cost the reader nothing. Following the Center for Election Science — who name the method "choose-one" after the restriction it imposes rather than after how the winner is picked — the verdict now turns on the single mark forcing voters to name a blocker instead of a favorite.

- The worked example is the `fptp-vote-splitting` case study ([[Features/Case Studies]]):
  a real, seeded election where Approval, IRV and STAR all elect one option and FPTP elects
  the one most voters ranked last. Where the Learn tab argues the point, that page lets a
  reader reproduce it.

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

### The effective pick

Because of that fallback, a ballot's FPTP vote is **`payload.fptp ?? payload.irv?.[0]`**, not `payload.fptp`. Anything reasoning about what a voter picked has to use the effective pick, and two places now do:

- **The strategic voting search** ([[Features/Strategic Voting]]) writes an explicit `fptp` when trialling a different pick on a ranked ballot. The explicit key wins over the fallback, so this moves FPTP's count and leaves `irv` — and IRV's count — untouched, which is what lets the two methods be analyzed in isolation. It also works the other way: an IRV trial **pins** `fptp` to the honest effective pick, so rewriting the ranking does not drag the FPTP column along with it.
- **`summarizeChange`** (the explorer's change chips) diffs the effective pick, so writing `fptp` onto a ranked ballot reads "picked Ada (was Cy)" rather than implying the voter previously had no pick. It is guarded on at least one side carrying an explicit key, so a plain ranking edit still says only what the ranking did.

## Migration

Added in migration 017: `ALTER TABLE elections ADD COLUMN include_fptp boolean DEFAULT false`.
