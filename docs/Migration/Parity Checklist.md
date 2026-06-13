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

- [ ] 🔴 **RES-01** — Algorithm display order is always **Approval → IRV → STAR → FPTP**, enforced client-side (not DB order); FPTP is always last. _Source:_ #65, [[Decisions/Algorithm Design]]. _Verify:_ election with algorithms entered out of order + `include_fptp` renders in canonical order.
- [ ] 🔴 **RES-02** — The full `result_data` shape is rendered field-by-field per algorithm: IRV per-round `rounds` with eliminations, STAR `scores` + `runoff`, Approval/FPTP `tallies`. Shape drift is a parity bug even when winners match. _Source:_ [[Backend/Edge Function]], M2 scope note. _Verify:_ render every golden fixture; diff against Flutter.
- [ ] 🟡 **RES-03** — Tied winners are displayed as equals, not with one arbitrarily promoted. _Source:_ #1, [[Decisions/Algorithm Design]]. _Verify:_ render a tie fixture; both names shown co-equal.
- [ ] 🟡 **RES-04** — Overall election winner shown when one candidate wins a majority/plurality of the selected algorithms ("overall winner"). _Source:_ #2. _Verify:_ multi-algorithm election where one candidate wins most methods.
- [ ] 🎨 **RES-05** — Per-algorithm results are laid out **side-by-side** (not stacked, which implies precedence), and remain usable on mobile. _Source:_ #44. _Verify:_ desktop + narrow viewport.
- [ ] 🟡 **RES-06** — Results render above the candidate list on the detail surface. _Source:_ #41. _Verify:_ closed election detail ordering.

---

## 3. Election detail / dashboard — M9

- [ ] 🔴 **DET-01** — Candidate list displays in **original entry order**, not reversed. _Source:_ #77. _Verify:_ create candidates c, a, b → list shows c, a, b on both detail and ballot.
- [ ] 🔴 **DET-02** — Owner-only controls reflect **live auth state**: ownership/visibility recomputes on token refresh, session expiry, or ownership change (don't read auth once and cache). _Source:_ #69. _Verify:_ simulate session change; owner controls update without an unrelated reload.
- [ ] 🔴 **DET-03** — Both **Open** and **Close** election actions have error handling that surfaces a user-visible message on failure (RLS/network). _Source:_ #71. _Verify:_ force each to fail → feedback shown, no silent revert.
- [ ] 🔴 **DET-04** — For the **owner**, a failed ballot-count or pending-invitees fetch shows an error indicator, never a silent empty/zero (closing on "0 votes" when the fetch failed is irreversible). _Source:_ #74. _Verify:_ force fetch error → indicator, not blank.
- [ ] 🟡 **DET-05** — No raw Supabase/Postgres exception text reaches the UI (no table/RLS/constraint names, query fragments). _Source:_ #72, #73. _Verify:_ trigger load/insert errors → friendly messages only.
- [ ] 🔴 **DET-06** — Stale-ballot warning ("candidates changed since your last vote") compares against the **server** clock, and **clears** once the voter re-votes covering the full candidate list — it must not be a permanent banner or fire on client-clock skew. _Source:_ #70, #33. _Verify:_ add candidate after a vote → warning appears; re-vote → warning gone; skew the client clock → no false positive.
- [ ] 🟡 **DET-07** — Ballot-submitted counter increments correctly (not stuck at 0). _Source:_ #35, #23. _Verify:_ submit ballots → count rises.

---

## 4. Ballot / voting flow — M10 (highest risk)

Template dispatch and derivation reference [[Architecture/Ballot Templates]] and [[Architecture/Ballot State Machine]]. Entries marked ⟐ are the derivation rules that **M23** reimplements as a verified pure TS module; M10 consumes that module rather than re-deriving — verify M10 calls it and the module passes its own fixtures.

- [ ] 🔴 **BAL-01** — Seven-template dispatch by algorithm combination (A–G); FPTP is an additive flag, never a template selector. _Source:_ [[Architecture/Ballot Templates]]. _Verify:_ each algorithm combination renders the correct template.
- [ ] 🔴 **BAL-02** ⟐ — Derivation rules: D `approval` = top-K of ranking; E `approval` = scores ≥ cutoff; F/G `irv` = score-desc → tie-break order → natural order; G `approval` = top-K of derived `irv`. _Source:_ [[Decisions/Client-Side Derivation]], [[Architecture/Ballot Templates]]. _Verify:_ M23 fixtures; M10 produces identical payloads.
- [ ] 🔴 **BAL-03** ⟐ — Manual tie-break: dragging within a score-tie group sets the IRV order for those candidates, and that order **survives subsequent score changes / resorts** (carried in `_tieBreaks`, not recoverable from scores alone). _Source:_ [[Decisions/Client-Side Derivation]], [[Architecture/Ballot State Machine]]. _Verify:_ score three candidates equally, drag to a specific order, change an unrelated score → tie order preserved.
- [ ] 🔴 **BAL-04** — "Rank-first, score-later" auto-scoring: dragging a 0-score candidate **above all other 0-score candidates** bumps its score to the highest value that ties no candidate above it (5, then 4, …); a 0-score candidate still below other 0s is left at 0. _Source:_ #83, [[Architecture/Ballot State Machine]] (drag-reorder branch). _Verify:_ from all-zero, drag to top → 5; drag next under it → 4.
- [ ] 🔴 **BAL-05** — Reordering with 0-score candidates is correct: an all-zero reorder persists (doesn't snap back); dragging a scored candidate down to 0 actually moves it in the order. _Source:_ #78. _Verify:_ reproduce #78 examples 1–3 → ordering holds.
- [ ] 🔴 **BAL-06** — FPTP ballot consistency: FPTP choice is **restricted to the candidates the voter already supports** — approved candidates (Template C) or highest-rated (Templates B/E) — and is part of the one ballot, not a separate inconsistent FPTP ballot. _Source:_ #62, [[Features/FPTP]]. _Verify:_ FPTP picker only offers approved/top-scored candidates.
- [ ] 🔴 **BAL-07** — STAR-family FPTP auto-selection: a single unambiguous top scorer is auto-selected; if it stops being the top scorer the selection clears; an explicit user override is preserved. _Source:_ [[Architecture/Ballot State Machine]] (`_autoFptpFromScores`), [[Features/FPTP]]. _Verify:_ raise/lower scores and watch auto-select set/clear; manual pick survives.
- [ ] 🔴 **BAL-08** — Editing a ballot restores **all** prior values, including `approval` (the #39 regression was approvals not rehydrating in combo templates). _Source:_ #39. _Verify:_ vote with approvals in a combo election, edit → approvals prefilled.
- [ ] 🔴 **BAL-09** — When editing after candidates were added, the ballot includes the **full current candidate list**, not just the previously-voted subset. _Source:_ #34. _Verify:_ vote, add candidate, edit → new candidate present.
- [ ] 🔴 **BAL-10** — Ad-hoc candidate merge: when polling detects a candidate change, new candidates are merged in (score 0, appended to bottom of ranking, **not** auto-approved) and removed candidates are stripped from all state — **without discarding the voter's in-progress scores/order**. _Source:_ #36, [[Features/Ad-Hoc Candidates]], [[Architecture/Ballot State Machine]] (`_mergeNewCandidates`). _Verify:_ start voting, owner adds/removes a candidate → merge preserves work.
- [ ] 🔴 **BAL-11** — Pre-submit candidate gate: on submit, re-check the candidate count; if it changed since the ballot was built, merge + warn + **do not submit** — the voter must review and submit again. _Source:_ #36, [[Architecture/Ballot State Machine]] (pre-submit gate). _Verify:_ add a candidate between ballot build and submit → submission blocked, ballot refreshed.
- [ ] 🟡 **BAL-12** — Zero-approval soft warning: first submit with zero approvals warns non-blockingly and returns; a second submit is allowed (silent confirmation); the flag resets per ballot session. Approval UI sits at the bottom of the ballot. _Source:_ #60, [[Architecture/Ballot Templates]] (zero-approval). _Verify:_ submit with 0 approvals twice → warn then allow.
- [ ] 🟡 **BAL-13** — Ballot change detection on edit: if the re-submitted payload is byte-identical to the stored one, skip the realtime compute call. _Source:_ [[Architecture/Ballot State Machine]] (change detection). _Verify:_ open + re-submit unchanged ballot → no compute call.
- [ ] 🔴 **BAL-14** — `ballots.updated_at` is set by the **server** (Postgres `now()` / trigger), never supplied by the client; the local model is updated from the upsert response. This is what makes DET-06 correct. _Source:_ #70, #80. _Verify:_ submit, inspect row → server timestamp; re-edit bumps it.
- [ ] 🟡 **BAL-15** — Score-0 candidates are placed at the **bottom** of the derived IRV ranking in natural candidate order (no tie-break UI for the zero group). _Source:_ [[Architecture/Ballot State Machine]] (`_deriveRanking`). _Verify:_ leave some candidates at 0 → they sort last in entry order.
- [ ] 🟡 **BAL-16** — View-only mode: a submitted ballot can be reopened read-only with all inputs disabled, rendering the saved values. _Source:_ [[Architecture/Ballot Templates]] (view-only), #3. _Verify:_ "review ballot" → inputs disabled, values shown.
- [ ] 🎨 **BAL-17** — Reranking on score change animates (gradual slide), rather than snapping instantly, so the user can follow the movement. _Source:_ #48, #46, #50. _Verify:_ tap a score in F/G → candidate slides to new position.
- [ ] 🟡 **BAL-18** — Back navigation is available from the ballot screen. _Source:_ #49, #25. _Verify:_ ballot screen has working back affordance.

---

## 5. Election creation / edit — M11

- [ ] 🔴 **CRT-01** — Candidates are **persisted** in entry order (root cause of #77 was insertion ordering, not just display). _Source:_ #77. _Verify:_ create in a known order → stored `position` matches entry order.
- [ ] 🔴 **CRT-02** — Duplicate-candidate detection uses the stable Postgres unique-violation **error code `23505`**, not a string match on the index name. _Source:_ #73. _Verify:_ add a duplicate name → friendly message; rename the index in a test → message still works.
- [ ] 🟡 **CRT-03** — Feature flags are independently settable: `include_fptp`, `realtime_results`, `public_ballots`, `allow_voter_candidates`; realtime-results and ad-hoc-candidates are **decoupled** (not a single toggle). _Source:_ #75, #55, #81. _Verify:_ toggle each independently.
- [ ] 🎨 **CRT-04** — The `public_ballots` option does **not** carry the "Cannot be changed after the election opens" helper text singling it out (that constraint applies to all such options and is assumed). _Source:_ #86. _Verify:_ create screen copy.
- [ ] 🟡 **CRT-05** — Draft elections are editable; leaving with unsaved changes prompts a discard-changes confirmation. _Source:_ #30, #29. _Verify:_ edit a draft, navigate away → confirm prompt.
- [ ] 🟡 **CRT-06** — Title/subtitle render correctly on the create/edit flow (the #86 cluster). _Source:_ #86. _Verify:_ side-by-side with Flutter.

---

## 6. Invite voters — M12

- [ ] 🔴 **INV-01** — Voters added from prior elections are **remembered**: the Add→✓ state persists across closing/reopening the invite sheet and leaving/returning to the election. _Source:_ #57. _Verify:_ add a prior co-voter, collapse + reopen sheet, leave + return → still ✓.
- [ ] 🔴 **INV-02** — A "pending invitees" affordance lists invited-but-not-yet-voted voters, visible to all viewers, and **refreshes** as people vote. _Source:_ #57, #84. _Verify:_ invitee votes while sheet is open → drops off pending list.
- [ ] 🔴 **INV-03** — The submitted-voters list refreshes to include a new voter who submits while you are already on the screen (don't snapshot it once at mount). _Source:_ #84. _Verify:_ open detail, have another user vote → their name appears.
- [ ] 🟡 **INV-04** — Join-link redirect threads through account creation: clicking a join link, then signing up/in, returns the user to the election they were joining. _Source:_ #43, [[Architecture/Auth Flow]]. _Verify:_ join link → forced signup → lands on the election.
- [ ] 🎨 **INV-05** — QR code available for the invite/join link. _Source:_ #63, [[Features/Invite Voters]]. _Verify:_ invite UI shows a scannable code.

---

## 7. Auth & public info pages — M13

- [ ] 🔴 **AUTH-01** — `redirect=` query param threads through the full login → signup → OTP chain and lands on the original destination. _Source:_ #43, [[Architecture/Auth Flow]]. _Verify:_ deep-link to a gated route while logged out → end up there post-auth.
- [ ] 🟡 **AUTH-02** — Google OAuth consent screen shows "EZ Vote", not the raw `*.supabase.co` project URL. _Source:_ #21. _Verify:_ run the Google sign-in consent (config-level; re-check at cutover).
- [ ] 🟡 **AUTH-03** — Password recovery flow works end-to-end. _Source:_ #79. _Verify:_ request reset → email link → set new password.
- [ ] 🟡 **AUTH-04** — Authenticated requests use the expected JWT auth path (the ES256/gateway handling that `compute-results` relies on via `--no-verify-jwt` + in-function `getUser`). _Source:_ #51, [[Backend/Edge Function]]. _Verify:_ authed compute call succeeds.

---

## 8. Settings / account — M14

- [ ] 🟡 **SET-01** — Account deletion flow removes the user and cascades per schema. _Source:_ #15. _Verify:_ delete account → user + owned data removed.

---

## 9. Realtime — M15

These were Flutter polling bugs; React will likely use Supabase realtime subscriptions. **Re-test the scenario, not the timer logic** — the observable guarantees are what matter.

- [ ] 🔴 **RTM-01** — A change that occurs in the **first interval after the screen mounts** is not missed: results, ballot count, voters list, and public-ballots list all refresh for it (the #82 "first tick seeds but doesn't invalidate" trap). _Source:_ #82. _Verify:_ have another user submit a ballot within seconds of opening the detail screen → everything updates.
- [ ] 🔴 **RTM-02** — Concurrent refreshes don't race: overlapping updates can't overwrite the change-tracking baseline and drop an update (the #66 in-flight guard). _Source:_ #66. _Verify:_ throttle the network, fire rapid changes → no dropped update.
- [ ] 🔴 **RTM-03** — Realtime recovers from a transient error instead of dying silently: after a fetch/subscription error, it re-establishes rather than staying dead until navigation. _Source:_ #67. _Verify:_ induce a transient failure → updates resume without leaving the screen.
- [ ] 🔴 **RTM-04** — Background refresh does not steal focus from an open modal/sheet — e.g. an owner typing in the invite search field isn't interrupted by a realtime update. _Source:_ #68. _Verify:_ type in the invite search while changes stream in → focus/keyboard retained.
- [ ] 🔴 **RTM-05** — Realtime results update for **all** participants when any voter submits **or edits** a ballot; an edit (unchanged ballot count) still refreshes by detecting that results changed. _Source:_ #40, [[Features/Realtime Results]]. _Verify:_ a voter edits a ballot → other viewers' results update.
- [ ] 🟡 **RTM-06** — Refresh only happens when something actually changed (no loading-flash / redundant refetch on a no-op tick — the counts-first / change-detection discipline). _Source:_ #40, [[Architecture/Ballot State Machine]] (candidate polling). _Verify:_ idle screen → no visible reload churn.
- [ ] 🟡 **RTM-07** — The realtime compute call after submit is **non-blocking**: if it fails, the ballot submission still succeeds. _Source:_ [[Architecture/Ballot State Machine]] (submit flow), [[Features/Realtime Results]]. _Verify:_ force compute to fail → ballot still saved.

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
