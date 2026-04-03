# Ballot State Machine

Internal state and algorithms for `lib/presentation/screens/ballot_screen.dart`. See [[Ballot Templates]] for what each template looks like to the user.

## State Variables

```dart
// Primary voting state
Map<String, int> _scores         // STAR: score 0–5 per candidate ID
List<String> _rankings           // IRV: ordered list of candidate IDs (index 0 = rank 1)
Set<String> _approvals           // Approval: set of approved candidate IDs
String? _fptpChoice              // FPTP: single selected candidate ID

// Derivation controls
int _approvalCutoff = 3          // Templates E: approve candidates with score >= this
int _approvalTopK = 0            // Templates D, G: approve top N from ranking

// Tie-break state (Templates F, G only)
Map<int, List<String>> _tieBreaks     // score → ordered IDs for candidates tied at that score
Map<String, Offset> _slideOffsets     // candidate ID → current animation offset

// UX flags
bool _warnedZeroApprovals = false     // tracks whether zero-approval warning was shown
bool _isSubmitting = false            // prevents double-submit
```

## Initialization

On `initState`, called once with the candidate list and optional `initialBallot`:

1. If `initialBallot` exists: deserialize payload into `_scores`, `_rankings`, `_approvals`, `_fptpChoice`.
2. Otherwise: initialize with defaults — scores 0, rankings in candidate position order, empty approvals.
3. Call `_syncTieBreaks()` to establish initial tie-break state.
4. If `allowVoterCandidates`: start `Timer.periodic` for candidate polling (10s interval).

## `_syncTieBreaks()`

Called after every score change. Maintains `_tieBreaks` to reflect current tie groups.

```
For each score value that appears more than once:
  If a tie-break entry already exists for that score:
    Filter it to only candidates still at that score, preserving order
    Add any newly-tied candidates at the end
  Else:
    Create new entry with candidates sorted by current ranking
Remove entries for scores that no longer have ties
Exclude score-0 ties (zero-scored candidates don't need tie-breaking for IRV)
```

Score-0 candidates are always placed at the bottom of the derived ranking in natural candidate order — no tie-break UI needed.

## `_rebuildTieBreaksFromOrder(List<String> newOrder)`

Called after a drag reorder in Templates F/G. Rebuilds the entire `_tieBreaks` map from the new list order instead of incrementally patching it. Used when the user manually drags a candidate.

## `_deriveRanking() → List<String>`

Produces the IRV ranking from scores and tie-breaks. Used in Templates F and G.

```
Sort candidates by:
  1. Score descending (higher score = higher rank)
  2. Within same score: order from _tieBreaks[score] (user's manual preference)
  3. Within score 0 (no tie-break): original candidate list order
```

## `_deriveApprovalsFromScores() → Set<String>`

Used in Template E. Returns all candidate IDs where `_scores[id] >= _approvalCutoff`.

## `_deriveApprovalsFromRanking() → Set<String>`

Used in Templates D and G. Returns the first `_approvalTopK` IDs from the current ranking.

## `_autoFptpFromScores()`

Used in Templates B and E (STAR-enabled templates with FPTP).

```
maxScore = max value in _scores
topCandidates = candidates where score == maxScore

If topCandidates.length == 1:
  _fptpChoice = topCandidates.first.id    // unambiguous top scorer
Else if _fptpChoice is set and that candidate is no longer in topCandidates:
  _fptpChoice = null                       // was top scorer, no longer is
// Otherwise: don't change — preserve user's explicit choice or leave null
```

Called via `WidgetsBinding.addPostFrameCallback` to avoid build-phase mutations.

## `_mergeNewCandidates(List<Candidate> fresh)`

Called when candidate polling detects a change. Merges new/removed candidates into current ballot state without resetting the voter's in-progress work.

```
newIds = fresh.map(id) - existing candidate ids
removedIds = existing candidate ids - fresh.map(id)

For each newId:
  _scores[newId] = 0
  _rankings.add(newId)              // new candidates go to bottom of ranking
  // Don't add to _approvals — user must explicitly approve

For each removedId:
  _scores.remove(removedId)
  _rankings.remove(removedId)
  _approvals.remove(removedId)
  if _fptpChoice == removedId: _fptpChoice = null
  remove from all _tieBreaks entries

_syncTieBreaks()
```

## Candidate Polling (Ad-Hoc Elections)

When `election.allowVoterCandidates = true`, a `Timer.periodic` runs every 10 seconds:

1. Call `candidateRepository.countForElection(electionId)` — lightweight, counts IDs only.
2. Compare to `ref.read(candidatesProvider(electionId)).value?.length`.
3. If counts differ: invalidate `candidatesProvider` to trigger a full fetch.
4. When new data arrives: call `_mergeNewCandidates(freshCandidates)`.
5. Show a snackbar notifying the voter of the change.

Counts-first approach avoids triggering a loading-state flash on every poll tick when nothing changed.

## Pre-Submit Gate

On submit, before building the payload:

1. Re-fetch current candidate count from DB.
2. If count differs from current state: merge candidates, show warning, return without submitting.
3. Voter must review the updated ballot and submit again.

This prevents a ballot from being submitted with stale candidate data.

## Payload Construction

After validation, builds the JSONB payload:

```dart
Map<String, dynamic> payload = {};

if (star):   payload['star'] = { id: score for each candidate }
if (irv):    payload['irv'] = _rankings   // or _deriveRanking() for Template F/G
if (approval): payload['approval'] = _approvals.toList()
              // or derived via _deriveApprovalsFromScores() / _deriveApprovalsFromRanking()
if (fptp):   payload['fptp'] = _fptpChoice
```

## Ballot Change Detection

On edit submit, the new payload is JSON-stringified and compared to the old ballot's payload string. If identical, the realtime compute call is skipped. This prevents redundant edge function calls when a voter opens and re-submits without changing anything.

## Submit Flow

```
1. Validate: zero-approval check (warn + return on first offense)
2. Pre-submit gate: check for candidate changes
3. Build payload
4. BallotRepository.upsertBallot(electionId, payload)
5. If realtimeResults && payload changed:
     ResultRepository.computeResults(electionId, close: false)  // non-blocking
6. Invalidate: existingBallotProvider, ballotCountProvider
7. Navigate: context.pop() or context.go('/election/:id')
```

Step 5 errors are caught and logged — a failure to compute realtime results does not fail the ballot submission.
