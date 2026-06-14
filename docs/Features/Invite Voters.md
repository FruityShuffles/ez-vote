# Invite Voters

Election owners can invite voters from the Invite Voters sheet, opened via the "Invite" button on `ElectionDetailScreen`. The sheet (`_InviteSheet`) provides two ways to share a join link.

## Join Link

The join URL has the form:

```
<origin>/election/<election-id>/join
```

This is constructed client-side using `Uri.base.origin`. It routes to `JoinElectionScreen`, which requires the visitor to be authenticated. Unauthenticated visitors are redirected to `/login?redirect=<join-url>` and land on the join screen after signing in.

## Copy Join Link

Copies the join URL to the clipboard and shows a snackbar confirmation. Implemented in `_InviteSheetState._copyJoinLink()`.

## QR Code

Tapping "QR" opens an `AlertDialog` containing a 240×240 QR code (`QrImageView` from `qr_flutter`) encoding the same join URL. Intended for the host to display on their phone for in-person sharing. Implemented in `_InviteSheetState._showQrCode()`.

## Add from Prior Elections

The sheet also shows a searchable list of users who have co-voted with the owner in past elections (`priorCovotersProvider`). Selecting a user calls `BallotRepository.addVoterToElection()`, which inserts a row into `election_voters` and invalidates `pendingInviteesProvider`.

## React port (M12)

The React app reproduces this flow against the same RPCs (`join_election`,
`get_prior_covoters`, `add_voter_to_election`). The owner sheet is
`web-react/src/components/elections/InviteVotersDialog.tsx` (opened from the
"Invite Voters" button in `ElectionDetail`'s owner controls), and the join deep
link is `web-react/src/routes/JoinElection.tsx` at `/election/:id/join`. The data
hooks (`usePriorCovoters`, `useAddVoterToElection`, `useJoinElection`) live in
`web-react/src/lib/elections.ts`. The QR code uses `qrcode.react`. The live
refresh of the pending-invitees / submitted-voters lists as people vote
(INV-02/INV-03) lands with realtime in M15; the add-time invalidation is wired
here.
