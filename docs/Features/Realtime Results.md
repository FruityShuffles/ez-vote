# Realtime Results

**Flag:** `election.realtimeResults = true`

Allows participants to see results update as ballots are cast, without closing the election.

## How It Works

After every ballot submission (or update), if `realtimeResults` is enabled and the payload actually changed, `BallotScreen` calls:

```dart
ResultRepository.computeResults(electionId, close: false)
```

This triggers the edge function in "realtime mode" (see [[Edge Function]]). The function recomputes all algorithm results and upserts them into the `results` table. The election stays open.

The call is **non-blocking**: errors are caught and logged but do not fail the ballot submission. The voter's experience is not degraded if the compute call fails.

## Ballot Change Detection

To avoid redundant compute calls when a voter re-opens and re-submits without making any changes:

```dart
final oldPayloadStr = jsonEncode(existingBallot?.payload);
final newPayloadStr = jsonEncode(newPayload);
if (oldPayloadStr != newPayloadStr) {
  ResultRepository.computeResults(electionId, close: false);
}
```

JSON serialization order is consistent because payload maps are always built from candidate ID order, making string comparison reliable.

## Results Polling in ElectionDetailScreen

When `realtimeResults` is true and the election is open, `ElectionDetailScreen` polls for updated results every 10 seconds:

```
1. Check results.updated_at for the election
2. If newer than last-seen timestamp: invalidate resultsProvider(electionId)
3. ResultsView re-renders with fresh data
```

The `updated_at` column on `results` (added in migration 014) makes this lightweight — the poll only fetches the timestamp, not the full result data, until a change is detected.

## Interaction with Election Close

When the owner closes the election (calls edge function with `close=true`), the same compute logic runs once more — final results are committed and the `status` flips to `'closed'`. After close, realtime polling stops because `ElectionDetailScreen` only polls while `status == 'open' && realtimeResults`.

## Authorization

Realtime compute calls (`close=false`) are allowed for any election participant, not just the owner. The edge function verifies that the caller is either the owner or is in `election_voters`. Close calls (`close=true`) are owner-only.

See [[Edge Function]] for the full auth check flow.
