# Invite Voters

Election owners can invite voters from the Invite Voters dialog, opened via the "Invite Voters" button in `ElectionDetail`'s owner controls. The dialog (`web-react/src/components/elections/InviteVotersDialog.tsx`) provides two ways to share a join link, plus a way to re-invite past co-voters.

The data hooks — `usePriorCovoters`, `useAddVoterToElection`, `useJoinElection` — live in `web-react/src/lib/elections.ts` and call the `get_prior_covoters`, `add_voter_to_election`, and `join_election` RPCs ([[Backend/RPC Functions]]).

## Join Link

The join URL has the form:

```
<origin>/election/<election-id>/join
```

It is constructed client-side from `window.location.origin`. It routes to `web-react/src/routes/JoinElection.tsx`, which is wrapped in `RequireAuth`: unauthenticated visitors are redirected to `/login?redirect=/election/<id>/join` and land back on the join screen after signing in (INV-04). The screen joins on mount and forwards to the election detail.

## Copy Join Link

Copies the join URL to the clipboard and shows a toast confirmation.

## QR Code

Opens a dialog containing a QR code (`qrcode.react`) encoding the same join URL. Intended for the host to display on their phone for in-person sharing.

## Add from Prior Elections

The dialog also shows a searchable list of users who have co-voted with the owner in past elections (`usePriorCovoters`). Selecting a user calls `useAddVoterToElection`, which inserts a row into `election_voters` and invalidates the prior-covoters and pending-invitees queries.

## Live Refresh

The pending-invitees and submitted-voters lists refresh as people vote (INV-02/INV-03) via the polling hook described in [[Features/Realtime Results]], on top of the add-time invalidation above.
