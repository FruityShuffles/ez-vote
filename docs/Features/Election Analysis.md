# Election Analysis

**Flutter:** `lib/domain/services/election_analysis_service.dart` + `lib/domain/models/election_analysis.dart`
**React (M16):** `web-react/src/lib/analysis.ts` (pure `analyzeResults` + types) rendered by `AnalysisCard` in `web-react/src/components/results/ResultsView.tsx`.

Generates cross-algorithm insights from computed results. Runs client-side after results are loaded — nothing is stored in the database.

> **React port decision (M16 / ANL-01):** kept **client-side** in TypeScript rather than moving to an edge function. It's pure derivation from the already-fetched `result_data`, needs no schema or endpoint change (the migration's no-backend-change non-goal), and stays mechanism-identical to the frozen Flutter app. `analysis.ts` is a verbatim port — same verdict logic, the same five conditional insights, and the same user-visible strings (curly apostrophes and em-dashes preserved) — so the rendered text matches Flutter for parity. `analysis.ts` is UI-free (insight `icon` is a string key resolved to a lucide component in `AnalysisCard`), keeping it unit-testable; see `web-react/src/lib/analysis.test.ts`.

## When It Runs

`ElectionDetailScreen` invokes the analysis service whenever `resultsProvider` has data and the election has more than one algorithm enabled. The `ElectionAnalysis` object is passed to `ResultsView` for display as an insight card above the per-algorithm result cards.

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
allWinners = results.map(r => r.winner).toSet()

If allWinners.length == 1:
  → "Consensus: All voting methods chose the same winner"

Else if majority of methods agree:
  → "Partial agreement: [N] of [M] methods chose [winner]"

Else:
  → "Methods disagree: [algorithm] chose [winner], [algorithm] chose [winner]"
```

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
