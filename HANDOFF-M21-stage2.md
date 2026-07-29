# Handoff: M21 stage 2 — wire the what-if explorer to its endpoint (#107)

Paste this to Codex. Delete this file once the work lands.

---

## Task

Finish issue **#107 (M21)** in the EZVote repo: wire the already-built
counterfactual UI to the `simulate-counterfactual` edge function and ship it.

Stage 1 (design + presentational components + a prototype route) is **done,
committed and pushed** — commits `6a38135`, `c21b8ff`, `3836582`. Your job is
stage 2 only. Do not redesign what exists.

## Read first

- `docs/Features/Counterfactual Explorer.md` — what was built, the design rules,
  and a "Two traps" section describing bugs you *will* otherwise reintroduce.
- `docs/Backend/Simulate Counterfactual.md` — the endpoint contract, verified
  live against production.
- `CLAUDE.md` — repo workflow. Docs live in `docs/` and must be updated when
  architecture or features change.

Run `npm --prefix ./web-react run dev` and open `/design/explore` to see the
working prototype before changing anything. Its three scenario buttons show every
rail state.

## What already exists (do not rebuild)

Under `web-react/src/components/counterfactual/`: `ConsequenceRail.tsx` (plus
`ConsequenceSummaryBar`), `BallotPicker.tsx`, `BallotFingerprint.tsx`,
`EditLedger.tsx`, `HypotheticalBallot.tsx`. All are presentational and
prop-driven — the codebase's container/view split (`ResultsView`/`ResultsList`,
`ElectionDetail`/`ElectionDetailView`). Stage 2 adds **containers**, not new
presentation.

Pure modules: `web-react/src/lib/counterfactual.ts` (types mirroring the endpoint
contract, plus outcome phrasing) and `web-react/src/lib/counterfactualFilter.ts`
(picker/ledger rules). Both have full unit tests.

263 tests currently pass. Keep them passing.

## Build

**1. `useSimulate` in `web-react/src/lib/counterfactual.ts`**

Call `supabase.functions.invoke('simulate-counterfactual', { body: { election_id,
overrides } })`, following the `useCloseElection` pattern in `lib/elections.ts`.

- Debounce ~250ms so a drag doesn't fire a request per frame.
- Use `placeholderData` (keep previous) so the rail never blanks — pass the
  in-flight state to the rail's `pending` prop instead.
- Errors return 400 `{ error }`. Surface validation messages verbatim; use one
  generic message for the not-found/not-a-participant case, which the endpoint
  deliberately cannot distinguish.

**2. Ledger store**

Small Zustand store (already a dependency) keyed by election id, so edits survive
navigation between the two screens and reset when the election changes.

**3. Routes** in `router.tsx`, under `RequireAuth`:

- `/election/:id/explore` — picker
- `/election/:id/explore/:voterId` — editor

Key on `voterId`, never list index.

**4. Entry point** in `ElectionDetail.tsx`, under the existing results block
(around the `showResults` section). Button copy is **"Explore what-ifs"** —
this wording is decided, do not change it to the issue's "Explore Election".

Show only when `status === 'closed' && public_ballots`. When `public_ballots` is
false, show a one-line explanation **to the owner only**.

**5. Override payloads** come from the existing `useBallotState().getPayload()`.
It already emits exactly the `{ approval, irv, star, fptp }` shape the endpoint
validates, including the template D/E/F/G derivation. **Write no new derivation
logic.**

## Hard constraints

- **Never add `SUPABASE_SERVICE_ROLE_KEY` to `simulate-counterfactual`.** Its
  absence *is* the mutation guarantee. Nothing in this feature writes.
- **Never edit an already-applied migration** — add a new file instead. No schema
  change should be needed here at all.
- Do not touch the frozen Flutter app (`lib/`). Do not deploy or modify the
  legacy `ez-vote` Pages project (rollback-only).
- Do not weaken the `public_ballots` gate. "Let owners toggle it after draft" is
  explicitly not an acceptable fix — it retroactively exposes ballots cast under
  an expectation of privacy (the owner bypass migration 021 closed).
- Preserve canonical algorithm order (Approval → IRV → STAR → FPTP), parity item
  RES-01.
- Keep the `aria-label` on the `NOW` fingerprint strip. The changed-chip marking
  is purely visual; that label is the only description assistive tech gets.

## Two traps (documented, and you will hit both)

1. **Seed the editor from the pending hypothetical, not the stored ballot** —
   otherwise re-opening an edited ballot silently discards the edit.
2. **Diff against a canonicalised original** — loading a ballot re-derives its
   approval list and ranking from scores, so a round-tripped payload can differ
   from the stored one. See `canonicalPayload` in `routes/DesignExplore.tsx`.

Also: `useBallotState` builds state once, so remount the editor per voter with
`key={voterId}`.

## Verify

1. `npm --prefix ./web-react run lint`, `run typecheck`, `run test:run` — all
   clean, no test deleted to make it pass.
2. Add unit tests for the new containers and the store.
3. Playwright spec (`npm --prefix ./web-react run e2e`), per
   `docs/Playwright-QA-Reference.md`. Use `TEST_USER_1` from `e2e/test-users.ts`.
   Flow: closed public-ballot election → Explore what-ifs → filter by candidate →
   open a ballot → make an edit that flips IRV → assert the rail marks IRV
   changed and the others unchanged → undo from the ledger → assert baseline
   returns.
   Note: base-ui renders two a11y nodes per control — use `getByRole`, not
   `getByLabel`.
4. **Prove nothing was written**: after the E2E run, re-read that election's
   `results` rows and ballot payloads and assert they are unchanged. This is the
   same check that closed out #106 and it is not optional.
5. Keyboard-only pass through both screens; `prefers-reduced-motion` honoured.

## Finish

- Update `docs/Features/Counterfactual Explorer.md` (drop its "Remaining work"
  section, change the status line), and mark M21 **Completed.** in
  `docs/Migration/Overview.md`.
- Decide whether `/design/explore` stays. It is unlinked and unguarded like
  `/design`; keeping it is fine, but it imports `@shared/tabulate` into the
  client bundle. If that's unwanted, lazy-load the design routes rather than
  deleting the prototype.
- Delete this handoff file.
- Commit `Fix #107: <summary>` and push to `main` to auto-close the issue.

## Not in scope

Issue **#120** (M20b, "minimum changes to flip outcome") is deliberately
deferred. The `EditLedger` is the surface it will eventually render into — leave
that seam intact, but do not build the search.
