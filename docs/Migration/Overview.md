# Flutter → React Migration

## Why

EZVote is a public-facing web product, and Flutter web is structurally weak for that profile:

- **Accessibility** — Flutter renders to canvas (CanvasKit). Screen reader, keyboard-only, and high-contrast support remain meaningfully worse than semantic HTML. Voting is a high-stakes a11y context.
- **Bundle size and first paint** — 2–3MB+ before our code. Election organizers share URLs to voters on arbitrary devices and networks; an abandoned first load is a disenfranchised voter.
- **Browser-native behavior** — find-in-page, text selection, browser translation extensions, right-click menus, and share sheets degrade or break under canvas rendering.
- **SEO and discovery** — Google cannot read canvas content. Any future public elections directory, embedded results, or sharable preview cards require HTML.
- **Ecosystem fit** — Supabase's first-class client libraries, the civic-tech OSS ecosystem, and every drag/drop and data-viz library we'd want for [[Features/Election Analysis]] and the upcoming counterfactual feature live in React/TS.

The forced React requirement for the counterfactual feature is the natural inflection point. Rather than maintaining two stacks indefinitely, we will migrate the full app and ship the new feature on the React stack.

## Approach: Parallel Build with Controlled Cutover

We are **not** doing a single risky cutover, and we are **not** doing a strangler-fig interleave. We are:

1. Extracting the algorithms to a backend-shared helper first, while Flutter remains in production.
2. Building the React app to full feature parity on a staging URL, against the same Supabase backend.
3. Running both apps in production for a verification window — real users on Flutter, testers on React, diffing behavior on real elections.
4. Flipping the primary domain to React when parity is verified.
5. Keeping Flutter deployable for a rollback window before final decommission.

This avoids the strangler-fig cost (building every shared concern twice across stacks, maintaining cross-stack bridges) and avoids the big-bang risk (no fallback, single cutover moment).

## Goals

- React app reaches behavioral parity with the current Flutter app on every voting algorithm, ballot template, and admin flow.
- Voting algorithms live in a single source of truth (a TypeScript helper called by both the existing `compute-results` edge function and the future `simulate-counterfactual` function).
- No regressions against the issue-fix history — every closed bug becomes a parity test case.
- Public URLs and deep links remain stable across the cutover.

## Non-Goals

- Native iOS/Android apps. Flutter's strongest argument is multi-platform; we are not planning native shipping, so it does not apply.
- Feature additions during the migration. The React build targets parity. New features wait until after cutover (except the counterfactual feature, which is the post-cutover capstone).
- Schema changes. The migration is a client rewrite. Supabase schema, RLS, and RPC remain stable.

## Phased Plan

### Phase 0 — Foundation (Flutter remains live)

The algorithms already exist as TypeScript functions inside `supabase/functions/compute-results/index.ts`. They need to be extracted from the I/O wrapper into a pure helper that both endpoints can call. This is the single highest-leverage move in the migration: it isolates the highest-stakes code (the algorithms) and protects it across stacks.

**Proposed issues:**

- **M1: Extract tabulation logic into a pure shared helper.** Refactor the four algorithm functions (`computeApproval`, `computeIrv`, `computeStar`, `computeFptp`) out of `compute-results/index.ts` into a shared module (e.g., `supabase/functions/_shared/tabulate.ts`). The endpoint becomes a thin wrapper: load → tabulate → persist → notify. No behavior change. Update [[Backend/Edge Function]] to reflect the new structure.

- **M2: Build a golden-test corpus from historical elections.** Snapshot ballots and computed results from real completed elections into a test fixture. Add a CI test that runs the shared helper against each fixture and asserts identical output. This guards every subsequent change to the algorithms — including the eventual React port that calls them.

- **M3: Catalog behavioral parity requirements.** Scan closed bug issues (especially the recent #83–#86 cluster) and the [[Decisions/Client-Side Derivation]] doc to produce `docs/Migration/Parity Checklist.md`. This is the test plan for the React build — each entry is a behavior the new app must preserve, often learned from a past incident.

### Phase 1 — React Foundation

**Proposed issues:**

- **M4: Tech stack decision (RFC).** Choose React framework (Next.js App Router vs Vite + React Router vs Remix/Tanstack Start), state library (Zustand vs Jotai vs Tanstack Query alone), styling (Tailwind vs CSS Modules vs Panda), and component library posture (headless primitives like Radix + custom, or a full kit like shadcn). Document the decision in `docs/Migration/Tech Stack.md`. Constraints: must work cleanly with Supabase client libraries, must support SSR-friendly public results pages, must deploy to Cloudflare Pages.

- **M5: Scaffold the React app and CI.** Repo structure (sibling folder, e.g., `web-react/`, alongside `lib/`), build pipeline, type-check, lint, test runner. Deploy a hello-world to a staging Cloudflare Pages project (e.g., `next.ez-vote.org`).

- **M6: Wire Supabase auth and session.** Email/password, OAuth (Google), OTP signup, redirect threading per [[Architecture/Auth Flow]]. Verify session persistence, anon → authenticated flows, and the `redirect=` query param threading through login → signup → OTP.

- **M7: Design system and shared components.** Buttons, forms, inputs, typography, layout primitives. Match Flutter's visual identity initially to keep cutover non-jarring. Accessibility baked in (semantic HTML, focus management, ARIA where needed).

### Phase 2 — Surface Ports

Surfaces are listed roughly in order of difficulty and dependency. Read-only public surfaces first (lowest risk, highest visible win), mutation flows second, admin last.

**Proposed issues:**

- **M8: Port public results view.** Read-only, no mutations. Renders `result_data` for each algorithm per the structures in [[Backend/Edge Function]]. Verify against Flutter on every historical election. This surface is also the future entry point to the counterfactual feature, so getting it right early is high-leverage.

- **M9: Port election detail / dashboard.** Owner controls, participant view, candidate list. State transitions per [[Architecture/Ballot State Machine]].

- **M10: Port ballot / voting flow — all 7 templates.** Highest-risk surface. Must reproduce client-side derivation rules from [[Decisions/Client-Side Derivation]] (templates D/E/F/G), tie-break preservation, drag/drop scoring with the auto-score-zero behavior (fixed in #83), public-ballots flag handling. Every parity-checklist item touching the ballot must pass.

- **M11: Port election creation and edit flow.** Form-heavy. Algorithm selection, candidate management, feature flags (`include_fptp`, `realtime_results`, `public_ballots`, `allow_voter_candidates`), the title/subtitle rendering fixed in #86.

- **M12: Port invite voters flow.** Email invites, join link, QR code, "add from prior elections" per [[Features/Invite Voters]]. Realtime invitee state per #84.

- **M13: Port auth screens (landing, login, signup, forgot password) and info pages (privacy, terms, learn).** Lower risk than the voting flow but blocks cutover — these are public surfaces hit by external links.

- **M14: Port settings / account management.** Account deletion flow.

- **M15: Port realtime updates.** Supabase realtime subscriptions for results and invitees per [[Features/Realtime Results]]. Validate ordering and race-condition handling against the issues that motivated #84.

- **M16: Port election analysis card.** Cross-method comparison insights per [[Features/Election Analysis]]. The current implementation lives in `lib/domain/services/election_analysis_service.dart` and is computed client-side; the React port can do the same or move it to an edge function — decide as part of this issue.

### Phase 3 — Cutover

**Proposed issues:**

- **M17: Side-by-side production deployment.** Both apps live, both pointing at the same Supabase backend. Real users on Flutter (`ez-vote.org`); testers and stakeholders on React (`next.ez-vote.org`). Document the verification protocol in `docs/Migration/Cutover Plan.md`.

- **M18: Parity verification window.** Run an actual election (or several) end-to-end on the React app while Flutter handles production traffic. Diff results, ballot payloads, invitee state, and analysis output against the golden corpus and against live Flutter behavior. Define exit criteria explicitly (e.g., "two consecutive weeks with zero parity defects found").

- **M19: DNS cutover.** Flip `ez-vote.org` to the React app. Flutter remains deployable at a holding URL (e.g., `legacy.ez-vote.org`) for the rollback window. Monitor closely for the first week.

### Phase 4 — Capstone and Decommission

- **M20: Build the `simulate-counterfactual` edge function.** Calls the shared tabulation helper (M1) with overridden ballot data. Returns recomputed results without persisting. Uses read-only DB credentials as a defense-in-depth guarantee against accidental mutation. Includes the "minimum changes to flip outcome" search.

- **M21: Build the counterfactual feature UI in React.** Data-viz heavy. Entry point from the ported results view (M8). This is the feature the migration was forcing-functioned by; shipping it on the React app vindicates the migration.

- **M22: Decommission Flutter.** After a substantial stability window post-cutover (suggest 60+ days), archive `lib/` to a git tag, remove the Flutter build pipeline from Cloudflare Pages, and remove the legacy URL. Update [[Architecture/Overview]] and all `lib/`-referencing docs to point at React equivalents.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Algorithm output drift between Flutter and React | M1 + M2: single backend helper + golden tests. Both clients call the same code. |
| Hard-won fixes silently re-introduced | M3 parity checklist as test plan for each surface port. |
| Client-side derivation logic ported incorrectly (templates D/E/F/G) | M10 specifically calls out [[Decisions/Client-Side Derivation]] as required reading. Add unit tests for derivation against fixed inputs before porting the UI. |
| Realtime race conditions re-introduced (e.g., #84) | M15 calls out the specific issue history; verification window (M18) runs realtime against real elections. |
| Cutover breaks deep links shared in past elections | URL schema in [[Architecture/Overview]] is the contract; the React app must honor every route exactly. Auth redirect threading verified in M6. |
| "Two-stack forever" via stalled migration | Phased plan has explicit cutover gate (M19) and decommission step (M22). The verification window in M18 has exit criteria, not vibes. |
| Subtle behavior not captured by code or docs | Verification window (M18) on real elections. Both apps run in production simultaneously; differences surface in real use. |

## Documentation Roadmap

**To be written during the migration:**

- `docs/Migration/Parity Checklist.md` (M3) — behaviors that must be preserved, sourced from closed bugs and design decisions.
- `docs/Migration/Tech Stack.md` (M4) — framework / library / styling decisions and rationale.
- `docs/Migration/Cutover Plan.md` (M17) — verification protocol, exit criteria, rollback procedure.

**To be updated:**

- [[Backend/Edge Function]] — after M1, to reflect the shared `tabulate` helper.
- [[Architecture/Overview]] — after M5 (add React app to the picture) and after M22 (remove Flutter).
- `docs/EZVote.md` — top-level index entry for the Migration section.
- `CLAUDE.md` — add brief context that an active migration is underway and point at this doc.

**Untouched (by design):**

- [[Backend/Schema]], [[Backend/RLS Policies]], [[Backend/RPC Functions]] — the migration is a client rewrite; the backend contract is stable.
- [[Decisions/Algorithm Design]], [[Decisions/Client-Side Derivation]] — these decisions remain in force across both stacks.
