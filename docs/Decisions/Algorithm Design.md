# Algorithm Design Decisions

## Why These Four Algorithms

EZVote implements Approval, IRV, STAR, and FPTP specifically to compare them in the same election. The product thesis is that showing multiple methods side-by-side teaches voters and organizers about electoral system design. A single-algorithm tool wouldn't serve this educational purpose.

**Approval** — Simple, coalition-friendly. Captures breadth of support.

**IRV** — Eliminates spoiler effect within ranked preferences. Widely used in real elections (Australia, ranked-choice in US cities).

**STAR** — Combines score expression with a head-to-head runoff. Addresses the "strategic voting" critique of pure approval.

**FPTP** — Included only for comparison. Never the recommended method, but familiar and useful as a baseline to show what gets lost with simple plurality.

## Tie Handling Philosophy

All algorithms handle ties genuinely — multiple winners are returned when candidates are truly tied. There is no arbitrary tiebreaking by candidate ID or database insertion order.

This is intentional: in a real election, a genuine tie is a meaningful result that deserves acknowledgement, not silent resolution by an arbitrary rule. The results UI shows tied winners as equals.

The one exception: in IRV elimination, when multiple candidates are tied for fewest votes, they are all eliminated simultaneously in the same round. This matches common real-world IRV tie resolution and avoids an arbitrary decision about elimination order.

## Why STAR's Runoff Uses Preference Count, Not Score Sum

In the STAR runoff (phase 2), preference points are awarded based on which candidate a voter scored higher — not by summing scores. This prevents high absolute scores from dominating when the question is "which of these two do you prefer?"

A voter who scored A:5 and B:4 contributes one preference point to A. A voter who scored A:2 and B:1 also contributes one preference point to A. Both preferences are equal weight in the runoff — it's purely ordinal between the two finalists.

## No Server-Side Ballot Derivation

IRV rankings and approval sets that are derived from STAR scores are computed client-side before submission. The edge function receives final, explicit values — it doesn't re-derive anything.

This was a deliberate choice: the derivation logic (especially tie-break order) carries user intent that would be lost if re-derived server-side. The client knows the user's exact tie-break preferences; the server only sees the resulting ranked list. Re-deriving server-side from scores alone would discard tie-break information.

See [[Client-Side Derivation]] for a fuller discussion.

## Algorithm Display Order

Results are always shown in the order: **Approval → IRV → STAR → FPTP**.

This order is enforced in `ResultRepository.getResults()` (client-side sort after fetch) rather than relying on database ordering. FPTP is always last because it is a reference comparison, not a primary method — consistent with it being a flag rather than a peer algorithm.

## Why FPTP Is a Flag, Not an Algorithm

See [[FPTP]] → "Why It's a Flag, Not an Algorithm."

Short version: FPTP is educational scaffolding, not a first-class voting method. Making it a flag prevents it from being selected alone and signals that it's always comparative.

## pg_cron Cleanup

Elections older than 60 days are deleted automatically at 3 AM daily. This is primarily a storage and cost concern, not a product feature. The threshold is generous enough that no active election is at risk, and it avoids needing a manual admin cleanup process.
