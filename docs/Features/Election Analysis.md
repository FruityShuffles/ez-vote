# Election Analysis

`web-react/src/lib/analysis.ts` (pure `analyzeResults` + types), rendered by `AnalysisCard` in `web-react/src/components/results/ResultsView.tsx`.

Generates cross-algorithm insights from computed results. Runs client-side after results are loaded — nothing is stored in the database.

> **Why client-side (ANL-01):** it is pure derivation from the already-fetched `result_data`, so an edge function would add a round trip, an endpoint, and a deploy step for no gain. `analysis.ts` is UI-free — an insight's `icon` is a string key resolved to a lucide component in `AnalysisCard` — which keeps it unit-testable; see `web-react/src/lib/analysis.test.ts`.

## When It Runs

`ResultsView` runs the analysis whenever results are loaded and the election has more than one algorithm enabled. The resulting object is displayed as an insight card above the per-algorithm result cards.

## Output Structure

```dart
class ElectionAnalysis {
  final String headline;       // e.g. "All methods agree" or "Methods disagree"
  final String summary;        // 1-2 sentence description
  final List<String> insights; // Specific observations, one per detected pattern
}
```

## Consensus Detection

```
allWinners = results.map(r => r.winner).toSet()   // FPTP excluded

If allWinners.length == 1:
  → "Consensus: All voting methods chose the same winner"
  → but if FPTP dissents: "Every method but FPTP chose [winner]"

Else if majority of methods agree:
  → "Partial agreement: [N] of [M] methods chose [winner]"

Else:
  → "Methods disagree: [algorithm] chose [winner], [algorithm] chose [winner]"
```

**FPTP is excluded from the verdict but never spoken for.** The consensus count drops
`fptp` before comparing winners, which is deliberate — FPTP is the comparison baseline, not
a method competing for the verdict. The headline still has to be true of the page it sits
on: when the non-FPTP methods agree *and* FPTP picked someone else, the summary names the
methods that agreed and says what FPTP chose instead. Claiming "across all methods" /
"under every voting method" there would contradict the FPTP-divergence insight rendered
immediately below it — which is precisely the shape of the `fptp-vote-splitting` case study
([[Features/Case Studies]]).

Method names in both that summary and the divergence insight are joined as
`a` / `a and b` / `a, b and c`, since an election can enable three non-FPTP methods.

## Insights Generated

Each insight is a separate observation, only included if the pattern is detected:

### FPTP Divergence
If FPTP result differs from IRV or STAR winner. Explanation: "FPTP can elect a candidate who isn't the overall preference when the vote is split."

### Spoiler Effect
Detected in IRV: if the candidate with the most first-round votes is eliminated in a later round (loses before the final). Explanation: "The first-round leader was overtaken after lower-preference candidates were eliminated — a scenario FPTP cannot capture."

### STAR Runoff Flip
If the STAR phase-1 top scorer (highest total score) is different from the phase-2 runoff winner. Explanation: "The highest-scored candidate lost the head-to-head runoff — indicating voters broadly preferred the runner-up when directly compared."

### Approval Breadth vs. First-Choice Support
If the approval winner differs from the IRV or FPTP winner. Explanation: "Approval found a candidate with broad support that ranked methods didn't surface — suggesting [candidate] is a strong consensus choice even if not many voters' top pick."

### IRV vs. Approval Disagreement
If IRV and Approval produce different winners. Generates a neutral observation describing both results without declaring one "correct."

## Educational Framing

The insights are written to be educational, not prescriptive. The UI doesn't declare a "true" winner — it shows what each method found and explains the structural reason for disagreements. This is intentional product design: the goal is to help election organizers understand what their voters' preferences reveal.
