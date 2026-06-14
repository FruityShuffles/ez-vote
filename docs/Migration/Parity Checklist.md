# Parity Checklist

The behaviors the React app must preserve to reach parity with the frozen Flutter app. Most entries were learned from a production incident (a closed bug) or are a deliberate design decision — exactly the subtle, easy-to-lose behavior that a rewrite silently regresses. This is the **test plan** for each Phase-2 surface port (M8–M16): when you port a surface, every box in its section must be verified before that surface is considered at parity.

## How to use this

- Entries are grouped by the surface that implements them, headed with the migration issue that ports that surface.
- Each entry: a stable **ID**, the observable behavior, its **source** (closed issue `#N` or a decision/architecture doc), and a **Verify** note — how to prove the React build preserves it.
- **Observable behavior, not mechanism.** Many bugs were Flutter/Riverpod-specific (provider invalidation, `Timer.periodic` races). React will use different mechanisms (Supabase realtime subscriptions, TanStack Query, etc.). What must survive is the *observable behavior and the edge case the incident exposed* — re-test the scenario, don't port the implementation.
- Check a box (`- [ ]` → `- [x]`) when the React surface is verified against that behavior, ideally with an automated test or a recorded side-by-side run against Flutter (M18).
- Tabulation invariants (§1) are already machine-guarded by the **M2 golden corpus**; client-side derivation (§4, marked ⟐) is guarded by **M23**. Those sections cross-reference their guard rather than duplicating it.

Legend: 🔴 high-risk (core voting correctness or a hard-won incident) · 🟡 behavioral but lower-stakes · 🎨 visual/UX polish that still counts as parity.

---

## 1. Tabulation invariants — guarded by M2 golden corpus

These live in `supabase/functions/_shared/tabulate.ts` and are **shared, not ported** — both clients call the same helper. The React work here is to render them faithfully (see §2). Listed so the checklist is complete and the results view has its contract in one place. All are locked by `_shared/fixtures/` + CI.

- [ ] 🔴 **TAB-01** — Genuine ties yield *multiple* winners; never an arbitrary tie-break by candidate ID or DB insertion order. _Source:_ #1, [[Decisions/Algorithm Design]]. _Verify:_ golden fixtures `approval-tie`, `approval-all-tied`, `fptp-tie`.
- [ ] 🔴 **TAB-02** — IRV eliminates **all** candidates tied for fewest votes simultaneously in one round. _Source:_ [[Decisions/Algorithm Design]]. _Verify:_ fixture `irv-multi-elimination-tie`.
- [ ] 🔴 **TAB-03** — IRV `runner_up` lists **every** candidate eliminated in the final elimination round; multiple are joined with `" & "` (e.g. `"Bob & Carol"`). _Source:_ #37. _Verify:_ fixture `fptp-irv-fallback` (single-winner, multi-elim final).
- [ ] 🔴 **TAB-04** — STAR runoff scores by **preference count, not score sum**; a runoff tie breaks on total score; if score is also tied, both finalists co-win. _Source:_ #38, [[Decisions/Algorithm Design]]. _Verify:_ fixtures `star-runoff-tie-broken-by-score`, `star-three-way-score-tie`.
- [ ] 🔴 **TAB-05** — FPTP falls back to `payload.irv[0]` when a ballot has no explicit `payload.fptp` and IRV is enabled. _Source:_ [[Backend/Edge Function]], [[Features/FPTP]]. _Verify:_ fixture `fptp-irv-fallback`.
- [ ] 🟡 **TAB-06** — `result_data` is keyed by candidate **name** (not UUID) across `winner`/`winners`/`runner_up`/`tallies`/`scores`/`runoff`/`rounds[].counts`. _Source:_ [[Backend/Edge Function]]. _Verify:_ any fixture; the M8 renderer must read names.

---

## 2. Public results view — M8

- [x] 🔴 **RES-01** — Algorithm display order is always **Approval → IRV → STAR → FPTP**, enforced client-side (not DB order); FPTP is always last. _Source:_ #65, [[Decisions/Algorithm Design]]. _Verify:_ election with algorithms entered out of order + `include_fptp` renders in canonical order. _(M8: `sortResults` in `web-react/src/lib/results.ts`; covered by `ResultsView.test.tsx`.)_
- [x] 🔴 **RES-02** — The full `result_data` shape is rendered field-by-field per algorithm: IRV per-round `rounds` with eliminations, STAR `scores` + `runoff`, Approval/FPTP `tallies`. Shape drift is a parity bug even when winners match. _Source:_ [[Backend/Edge Function]], M2 scope note. _Verify:_ render every golden fixture; diff against Flutter. _(M8: `ResultsView.test.tsx` renders golden fixtures and asserts every field; full side-by-side diff still happens in M18.)_
- [x] 🟡 **RES-03** — Tied winners are displayed as equals, not with one arbitrarily promoted. _Source:_ #1, [[Decisions/Algorithm Design]]. _Verify:_ render a tie fixture; both names shown co-equal. _(M8: `ResultsView.test.tsx`, `approval-tie` fixture renders "Tied: Alice & Bob".)_
- [x] 🟡 **RES-04** — Overall election winner shown when one candidate wins a majority/plurality of the selected algorithms ("overall winner"). _Source:_ #2. _Verify:_ multi-algorithm election where one candidate wins most methods. _(M8: `OverallWinnerCard` + `ResultsView.test.tsx`.)_
- [ ] 🎨 **RES-05** — Per-algorithm results are laid out **side-by-side** (not stacked, which implies precedence), and remain usable on mobile. _Source:_ #44. _Verify:_ desktop + narrow viewport. _(M8: responsive grid implemented; visual side-by-side confirmation deferred to M18.)_
- [x] 🟡 **RES-06** — Results render above the candidate list on the detail surface. _Source:_ #41. _Verify:_ closed election detail ordering. _(M9: `ElectionDetailView` renders the results block before the candidate section; covered by `ElectionDetail.test.tsx` RES-06.)_

---

## 3. Election detail / dashboard — M9

- [x] 🔴 **DET-01** — Candidate list displays in **original entry order**, not reversed. _Source:_ #77. _Verify:_ create candidates c, a, b → list shows c, a, b on both detail and ballot. _(M9: `useCandidates` orders by `position` asc; `ElectionDetail.test.tsx` DET-01 asserts c, a, b. Ballot side is M10.)_
- [x] 🔴 **DET-02** — Owner-only controls reflect **live auth state**: ownership/visibility recomputes on token refresh, session expiry, or ownership change (don't read auth once and cache). _Source:_ #69. _Verify:_ simulate session change; owner controls update without an unrelated reload. _(M9: ownership reads live from `useAuth()`, which re-renders on `onAuthStateChange`; `ElectionDetail.test.tsx` DET-02 covers owner vs participant.)_
- [x] 🔴 **DET-03** — Both **Open** and **Close** election actions have error handling that surfaces a user-visible message on failure (RLS/network). _Source:_ #71. _Verify:_ force each to fail → feedback shown, no silent revert. _(M9: `OwnerControls` catches both mutations and shows a `friendlyError` toast; forced-failure side-by-side in M18.)_
- [x] 🔴 **DET-04** — For the **owner**, a failed ballot-count or pending-invitees fetch shows an error indicator, never a silent empty/zero (closing on "0 votes" when the fetch failed is irreversible). _Source:_ #74. _Verify:_ force fetch error → indicator, not blank. _(M9: `BallotCountRow` / `PendingInviteesRow` render an alert marker on `isError` instead of a count/empty; forced-failure verification in M18.)_
- [x] 🟡 **DET-05** — No raw Supabase/Postgres exception text reaches the UI (no table/RLS/constraint names, query fragments). _Source:_ #72, #73. _Verify:_ trigger load/insert errors → friendly messages only. _(M9: `friendlyError` in `lib/errors.ts` never echoes the raw message; `errors.test.ts` asserts an RLS string is replaced.)_
- [x] 🔴 **DET-06** — Stale-ballot warning ("candidates changed since your last vote") compares against the **server** clock, and **clears** once the voter re-votes covering the full candidate list — it must not be a permanent banner or fire on client-clock skew. _Source:_ #70, #33. _Verify:_ add candidate after a vote → warning appears; re-vote → warning gone; skew the client clock → no false positive. _(M9: compares server `candidates_updated_at` vs server `ballot.updated_at`; `ElectionDetail.test.tsx` DET-06 covers appears / clears / never-when-closed. Re-vote bump is BAL-14 in M10.)_
- [ ] 🟡 **DET-07** — Ballot-submitted counter increments correctly (not stuck at 0). _Source:_ #35, #23. _Verify:_ submit ballots → count rises. _(M9: `BallotCountRow` renders `get_ballot_count`; exercising the increment needs the ballot-submit flow (M10).)_

---

## 4. Ballot / voting flow — M10 (highest risk)

Template dispatch and derivation reference [[Architecture/Ballot Templates]] and [[Architecture/Ballot State Machine]]. Entries marked ⟐ are the derivation rules that **M23** reimplements as a verified pure TS module; M10 consumes that module rather than re-deriving — verify M10 calls it and the module passes its own fixtures.

- [x] 🔴 **BAL-01** — Seven-template dispatch by algorithm combination (A–G); FPTP is an additive flag, never a template selector. _Source:_ [[Architecture/Ballot Templates]]. _Verify:_ each algorithm combination renders the correct template. _M10:_ `getTemplate` + `BallotView` dispatch; unit-tested in `ballotState.test.ts` / `BallotView.test.tsx`.
- [x] 🔴 **BAL-02** ⟐ — Derivation rules: D `approval` = top-K of ranking; E `approval` = scores ≥ cutoff; F/G `irv` = score-desc → tie-break order → natural order; G `approval` = top-K of derived `irv`. _Source:_ [[Decisions/Client-Side Derivation]], [[Architecture/Ballot Templates]]. _Verify:_ M23 fixtures; M10 produces identical payloads. _M10:_ consumes `@shared/derive`; the 40 fixtures run in the React toolchain via `derive.test.ts`, plus per-template `buildSubmitPayload` assertions.
- [x] 🔴 **BAL-03** ⟐ — Manual tie-break: dragging within a score-tie group sets the IRV order for those candidates, and that order **survives subsequent score changes / resorts** (carried in `_tieBreaks`, not recoverable from scores alone). _Source:_ [[Decisions/Client-Side Derivation]], [[Architecture/Ballot State Machine]]. _Verify:_ score three candidates equally, drag to a specific order, change an unrelated score → tie order preserved. _M10:_ unit-tested. **Intentional divergence:** on *edit/view* the React port restores the tie order from the saved `irv` payload (`rebuildTieBreaksFromOrder`); the Flutter reference rebuilt it from candidate order, so an untouched F/G re-submit could silently flip a tie — do not flag this as a regression in M18.
- [x] 🔴 **BAL-04** — "Rank-first, score-later" auto-scoring: dragging a 0-score candidate **above all other 0-score candidates** bumps its score to the highest value that ties no candidate above it (5, then 4, …); a 0-score candidate still below other 0s is left at 0. _Source:_ #83, [[Architecture/Ballot State Machine]] (drag-reorder branch). _Verify:_ from all-zero, drag to top → 5; drag next under it → 4. _M10:_ `applyReorder` (M23 fixtures `apply-reorder-83-*`) + `reorderScored` index-mapping unit test.
- [x] 🔴 **BAL-05** — Reordering with 0-score candidates is correct: an all-zero reorder persists (doesn't snap back); dragging a scored candidate down to 0 actually moves it in the order. _Source:_ #78. _Verify:_ reproduce #78 examples 1–3 → ordering holds. _M10:_ `applyReorder` (M23 fixtures `apply-reorder-78-*`).
- [ ] 🔴 **BAL-06** — FPTP ballot consistency: FPTP choice is **restricted to the candidates the voter already supports** — approved candidates (Template C) or highest-rated (Templates B/E) — and is part of the one ballot, not a separate inconsistent FPTP ballot. _Source:_ #62, [[Features/FPTP]]. _Verify:_ FPTP picker only offers approved/top-scored candidates. _M10:_ implemented (`FptpPicker` eligible = top-scored/approved; emission gated to B/C/E, unit-tested) — confirm the picker UI in M18.
- [x] 🔴 **BAL-07** — STAR-family FPTP auto-selection: a single unambiguous top scorer is auto-selected; if it stops being the top scorer the selection clears; an explicit user override is preserved. _Source:_ [[Architecture/Ballot State Machine]] (`_autoFptpFromScores`), [[Features/FPTP]]. _Verify:_ raise/lower scores and watch auto-select set/clear; manual pick survives. _M10:_ `autoFptpFromScores` (M23 fixtures) + `setScore` unit test.
- [x] 🔴 **BAL-08** — Editing a ballot restores **all** prior values, including `approval` (the #39 regression was approvals not rehydrating in combo templates). _Source:_ #39. _Verify:_ vote with approvals in a combo election, edit → approvals prefilled. _M10:_ `initialBallotState` rehydration unit-tested (C approvals, E cutoff, D/G topK, fptp).
- [x] 🔴 **BAL-09** — When editing after candidates were added, the ballot includes the **full current candidate list**, not just the previously-voted subset. _Source:_ #34. _Verify:_ vote, add candidate, edit → new candidate present. _M10:_ `initialBallotState` folds in missing candidates; unit-tested.
- [x] 🔴 **BAL-10** — Ad-hoc candidate merge: when polling detects a candidate change, new candidates are merged in (score 0, appended to bottom of ranking, **not** auto-approved) and removed candidates are stripped from all state — **without discarding the voter's in-progress scores/order**. _Source:_ #36, [[Features/Ad-Hoc Candidates]], [[Architecture/Ballot State Machine]] (`_mergeNewCandidates`). _Verify:_ start voting, owner adds/removes a candidate → merge preserves work. _M10:_ `mergeCandidates` unit-tested; driven by an id-diff sync effect (poll + background refetch). UI flow to confirm in M18.
- [ ] 🔴 **BAL-11** — Pre-submit candidate gate: on submit, re-check the candidate count; if it changed since the ballot was built, merge + warn + **do not submit** — the voter must review and submit again. _Source:_ #36, [[Architecture/Ballot State Machine]] (pre-submit gate). _Verify:_ add a candidate between ballot build and submit → submission blocked, ballot refreshed. _M10:_ implemented in `Ballot.tsx` submit flow — verify end-to-end in M18.
- [ ] 🟡 **BAL-12** — Zero-approval soft warning: first submit with zero approvals warns non-blockingly and returns; a second submit is allowed (silent confirmation); the flag resets per ballot session. Approval UI sits at the bottom of the ballot. _Source:_ #60, [[Architecture/Ballot Templates]] (zero-approval). _Verify:_ submit with 0 approvals twice → warn then allow. _M10:_ implemented (`hasZeroApprovals` unit-tested; once-per-session flash in `Ballot.tsx`) — verify the warn-then-allow flow in M18.
- [ ] 🟡 **BAL-13** — Ballot change detection on edit: if the re-submitted payload is byte-identical to the stored one, skip the realtime compute call. _Source:_ [[Architecture/Ballot State Machine]] (change detection). _Verify:_ open + re-submit unchanged ballot → no compute call. _M10:_ implemented (`payloadsEqual`, order-insensitive for object keys) — verify in M18.
- [ ] 🔴 **BAL-14** — `ballots.updated_at` is set by the **server** (Postgres `now()` / trigger), never supplied by the client; the local model is updated from the upsert response. This is what makes DET-06 correct. _Source:_ #70, #80. _Verify:_ submit, inspect row → server timestamp; re-edit bumps it. _M10:_ implemented (`useUpsertBallot` never sends `updated_at`, reads it back) — verify against the DB in M18.
- [x] 🟡 **BAL-15** — Score-0 candidates are placed at the **bottom** of the derived IRV ranking in natural candidate order (no tie-break UI for the zero group). _Source:_ [[Architecture/Ballot State Machine]] (`_deriveRanking`). _Verify:_ leave some candidates at 0 → they sort last in entry order. _M10:_ `deriveRanking` (M23 fixtures `derive-ranking-zeros-at-bottom`).
- [x] 🟡 **BAL-16** — View-only mode: a submitted ballot can be reopened read-only with all inputs disabled, rendering the saved values. _Source:_ [[Architecture/Ballot Templates]] (view-only), #3. _Verify:_ "review ballot" → inputs disabled, values shown. _M10:_ `viewOnly` disables all inputs and drag; render-tested.
- [ ] 🎨 **BAL-17** — Reranking on score change animates (gradual slide), rather than snapping instantly, so the user can follow the movement. _Source:_ #48, #46, #50. _Verify:_ tap a score in F/G → candidate slides to new position. _M10:_ implemented via dnd-kit `animateLayoutChanges` on the sortable rows — verify the visual slide in M18.
- [ ] 🟡 **BAL-18** — Back navigation is available from the ballot screen. _Source:_ #49, #25. _Verify:_ ballot screen has working back affordance. _M10:_ implemented (Back button + branded header) — confirm in M18.

---

## 5. Election creation / edit — M11

- [x] 🔴 **CRT-01** — Candidates are **persisted** in entry order (root cause of #77 was insertion ordering, not just display). _Source:_ #77. _Verify:_ create in a known order → stored `position` matches entry order. _(M11: `buildCandidateRows` writes explicit zero-based positions; unit-tested in `elections.test.ts` and form reorder submission in `ElectionForm.test.tsx`.)_
- [x] 🔴 **CRT-02** — Duplicate-candidate detection uses the stable Postgres unique-violation **error code `23505`**, not a string match on the index name. _Source:_ #73. _Verify:_ add a duplicate name → friendly message; rename the index in a test → message still works. _(M11: client validation plus `isUniqueViolation`; code-based behavior covered in `errors.test.ts`.)_
- [x] 🟡 **CRT-03** — Feature flags are independently settable: `include_fptp`, `realtime_results`, `public_ballots`, `allow_voter_candidates`; realtime-results and ad-hoc-candidates are **decoupled** (not a single toggle). _Source:_ #75, #55, #81. _Verify:_ toggle each independently. _(M11: four separate switches and payload fields; covered in `ElectionForm.test.tsx`.)_
- [x] 🎨 **CRT-04** — The `public_ballots` option does **not** carry the "Cannot be changed after the election opens" helper text singling it out (that constraint applies to all such options and is assumed). _Source:_ #86. _Verify:_ create screen copy. _(M11: corrected subtitle render-tested.)_
- [x] 🟡 **CRT-05** — Draft elections are editable; leaving with unsaved changes prompts a discard-changes confirmation. _Source:_ #30, #29. _Verify:_ edit a draft, navigate away → confirm prompt. _(M11: React Router blocker plus `beforeunload`; dialog behavior render-tested.)_
- [x] 🟡 **CRT-06** — Title/subtitle render correctly on the create/edit flow (the #86 cluster). _Source:_ #86. _Verify:_ side-by-side with Flutter. _(M11: create/edit headings and settings copy render-tested; final visual comparison remains part of M18.)_

---

## 6. Invite voters — M12

- [x] 🔴 **INV-01** — Voters added from prior elections are **remembered**: the Add→✓ state persists across closing/reopening the invite sheet and leaving/returning to the election. _Source:_ #57. _Verify:_ add a prior co-voter, collapse + reopen sheet, leave + return → still ✓. _(M12: `get_prior_covoters` excludes already-added users, so `useAddVoterToElection` invalidating `prior-covoters` drops the row on refetch — persistence comes from the RPC exclusion, not local UI state; the transient ✓ is local. Mapping/invalidation covered in `elections.test.ts`.)_
- [x] 🔴 **INV-02** — A "pending invitees" affordance lists invited-but-not-yet-voted voters, visible to all viewers, and **refreshes** as people vote. _Source:_ #57, #84. _Verify:_ invitee votes while sheet is open → drops off pending list. _(M12 wired the add-time half; **M15** adds the live half: the `useElectionRealtime` poll invalidates `pending-invitees` when `results.updated_at` changes, so a voter dropping off appears within ~10s. Cross-client check in M18.)_
- [x] 🔴 **INV-03** — The submitted-voters list refreshes to include a new voter who submits while you are already on the screen (don't snapshot it once at mount). _Source:_ #84. _Verify:_ open detail, have another user vote → their name appears. _(M15: the poll invalidates `voters` on a results change, so the submitted-voters dialog reflects new voters without remount. Cross-client check in M18.)_
- [x] 🟡 **INV-04** — Join-link redirect threads through account creation: clicking a join link, then signing up/in, returns the user to the election they were joining. _Source:_ #43, [[Architecture/Auth Flow]]. _Verify:_ join link → forced signup → lands on the election. _(M12: `/election/:id/join` is behind `RequireAuth`, which threads `redirect=` through login→signup; `JoinElection` joins and forwards to detail. Once-only join covered in `JoinElection.test.tsx`.)_
- [x] 🎨 **INV-05** — QR code available for the invite/join link. _Source:_ #63, [[Features/Invite Voters]]. _Verify:_ invite UI shows a scannable code. _(M12: `InviteVotersDialog` renders a 240px `qrcode.react` SVG of the join URL; render-tested.)_

---

## 7. Auth & public info pages — M13

- [ ] 🔴 **AUTH-01** — `redirect=` query param threads through the full login → signup → OTP chain and lands on the original destination. _Source:_ #43, [[Architecture/Auth Flow]]. _Verify:_ deep-link to a gated route while logged out → end up there post-auth.
- [ ] 🟡 **AUTH-02** — Google OAuth consent screen shows "EZ Vote", not the raw `*.supabase.co` project URL. _Source:_ #21. _Verify:_ run the Google sign-in consent (config-level; re-check at cutover).
- [ ] 🟡 **AUTH-03** — Password recovery flow works end-to-end. _Source:_ #79. _Verify:_ request reset → email link → set new password.
- [ ] 🟡 **AUTH-04** — Authenticated requests use the expected JWT auth path (the ES256/gateway handling that `compute-results` relies on via `--no-verify-jwt` + in-function `getUser`). _Source:_ #51, [[Backend/Edge Function]]. _Verify:_ authed compute call succeeds.

---

## 8. Settings / account — M14

- [x] 🟡 **SET-01** — Account deletion flow removes the user and cascades per schema. _Source:_ #15. _Verify:_ delete account → user + owned data removed. _(M14: `Settings.tsx` confirm dialog → `deleteAccount()` (`delete_current_user` RPC) → `signOut()` (AuthProvider clears the query cache) → redirect to `/login`. Flutter dialog wording matched; flow render-tested in `Settings.test.tsx`; the schema cascade is unchanged from Flutter and verified end-to-end in M18.)_

---

## 9. Realtime — M15

These were Flutter polling bugs; the React port **keeps polling** (a 10s `useElectionRealtime` hook, mechanism-identical to Flutter) rather than adopting Supabase Realtime channels, which would need a backend publication change; the channel migration is tracked as a post-cutover follow-up. **Re-test the scenario, not the timer logic** — the observable guarantees are what matter.

- [x] 🔴 **RTM-01** — A change that occurs in the **first interval after the screen mounts** is not missed: results, ballot count, voters list, and public-ballots list all refresh for it (the #82 "first tick seeds but doesn't invalidate" trap). _Source:_ #82. _Verify:_ have another user submit a ballot within seconds of opening the detail screen → everything updates. _(M15: `useElectionRealtime` keeps `lastResultsUpdatedAt` null at mount — never seeds — so the first detected timestamp invalidates; covered in `useElectionRealtime.test.ts`. Public-ballots list isn't a ported surface yet.)_
- [x] 🔴 **RTM-02** — Concurrent refreshes don't race: overlapping updates can't overwrite the change-tracking baseline and drop an update (the #66 in-flight guard). _Source:_ #66. _Verify:_ throttle the network, fire rapid changes → no dropped update. _(M15: `inFlight` ref guard mirrors Flutter's `_polling`; an in-flight tick is skipped, not queued — tested.)_
- [x] 🔴 **RTM-03** — Realtime recovers from a transient error instead of dying silently: after a fetch/subscription error, it re-establishes rather than staying dead until navigation. _Source:_ #67. _Verify:_ induce a transient failure → updates resume without leaving the screen. _(M15: an errored detail query is invalidated to retry; a thrown poll fetch is swallowed with the baseline left intact and the interval kept running, so the next tick recovers — both tested.)_
- [x] 🔴 **RTM-04** — Background refresh does not steal focus from an open modal/sheet — e.g. an owner typing in the invite search field isn't interrupted by a realtime update. _Source:_ #68. _Verify:_ type in the invite search while changes stream in → focus/keyboard retained. _(M15: no explicit modal gate needed — the invite dialog is a base-ui portal and the poll never invalidates its data (`prior-covoters`), so the search input isn't refetched/blurred. The "leaves prior-covoters untouched" guarantee is asserted in `useElectionRealtime.test.ts`; the live focus scenario is M18 manual QA.)_
- [x] 🔴 **RTM-05** — Realtime results update for **all** participants when any voter submits **or edits** a ballot; an edit (unchanged ballot count) still refreshes by detecting that results changed. _Source:_ #40, [[Features/Realtime Results]]. _Verify:_ a voter edits a ballot → other viewers' results update. _(M15: every viewer on the detail surface runs the poll; a changed `results.updated_at` invalidates results regardless of ballot count. The submitter triggers recompute via M10's `triggerRealtimeCompute`. Verify cross-client in M18.)_
- [x] 🟡 **RTM-06** — Refresh only happens when something actually changed (no loading-flash / redundant refetch on a no-op tick — the counts-first / change-detection discipline). _Source:_ #40, [[Architecture/Ballot State Machine]] (candidate polling). _Verify:_ idle screen → no visible reload churn. _(M15: the poll reads only the cheap `results.updated_at` / candidate count and invalidates the heavy queries solely on an actual change; the no-op tick asserts no invalidation in `useElectionRealtime.test.ts`.)_
- [x] 🟡 **RTM-07** — The realtime compute call after submit is **non-blocking**: if it fails, the ballot submission still succeeds. _Source:_ [[Architecture/Ballot State Machine]] (submit flow), [[Features/Realtime Results]]. _Verify:_ force compute to fail → ballot still saved. _(Shipped in **M10**: `triggerRealtimeCompute` in `web-react/src/lib/ballot.ts` is fire-and-forget and swallows errors, called from `Ballot.tsx` only when the payload changed.)_

---

## 10. Election analysis card — M16

- [ ] 🟡 **ANL-01** — Cross-method comparison insights (where the algorithms agree/disagree, etc.) are generated and shown on results. Behavior currently in `lib/domain/services/election_analysis_service.dart`. _Source:_ #56, [[Features/Election Analysis]]. _Verify:_ multi-algorithm closed election → analysis card matches Flutter's insights.

---

## 11. Public ballots — cross-cuts M8 / M9

- [ ] 🟡 **PUB-01** — `public_ballots` flag gates a public, owner-controlled view of individual ballots via the dedicated RLS/RPC path, with paging. _Source:_ #81, [[Features/Public Ballots]], migrations 020/021. _Verify:_ enable public ballots → ballots viewable per the gate; paging works; RLS still blocks when off.

---

## Notes on coverage

- **Pure visual/styling issues** that carry no behavioral contract (logo assets #17/#20, learn-tab button sizing #9/#64, header emphasis #7, narrow-desktop layout #59, offscreen number #76, candidate-row drag affordance #27) are **not** itemized here — they're handled by the design-system port (M7) and visual side-by-side in M18. Re-skim the closed-issue list when porting a surface in case one became behavioral.
- **Tabulation (§1)** and **derivation (§4 ⟐)** are the two algorithm sources of truth and are machine-guarded (M2, M23). Everything else in this file is verified per-surface during its port and again holistically in **M18 (parity verification)**.
- When porting a surface, treat its section as acceptance criteria: no surface is "done" with unchecked 🔴 boxes.
</content>
