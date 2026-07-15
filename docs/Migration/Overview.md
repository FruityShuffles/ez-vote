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

1. Extracting the algorithms to a backend-shared helper first, while Flutter remains deployed.
2. Building the React app to full feature parity on a staging URL, against the same Supabase backend.
3. Verifying parity with structured test elections — every template, every algorithm combination — diffed against the golden corpus and against the same flows performed side-by-side in the Flutter app.
4. Flipping the primary domain to React when parity is verified.
5. Keeping Flutter deployable for a short rollback window before final decommission.

This avoids the strangler-fig cost (building every shared concern twice across stacks, maintaining cross-stack bridges) and avoids the big-bang risk (no fallback, single cutover moment).

**Flutter is frozen.** No further Flutter development happens during the migration — no bug fixes, no features. The deployed Flutter app is the parity reference, and freezing it keeps that reference stable. Bugs discovered in Flutter pre-cutover are recorded in the parity checklist with a per-case decision (fix in React, or reproduce as-is) rather than patched in Dart.

The site has no active user traffic yet, which lowers cutover stakes considerably: there is no need for a long dual-production window, real-user behavior diffing, or extended post-flip monitoring. The phased structure below is kept for its ordering discipline, not because the cutover moment itself is risky.

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

- **M2: Build a golden-test corpus from historical elections.** Snapshot ballots and computed results from completed elections into a test fixture. Add a CI test that runs the shared helper against each fixture and asserts identical output. This guards every subsequent change to the algorithms — including the eventual React port that calls them. Three scope notes:
  - **Pin the full `result_data` shape**, not just winners — the results view (M8) renders that structure field-by-field, so shape drift is a parity bug even when winners match.
  - **Supplement with synthetic fixtures** for edge cases the thin historical data won't cover: IRV multi-candidate elimination ties, STAR runoffs with 3+ tied entrants, the FPTP `payload.irv[0]` fallback, all-tied outcomes.
  - **Scrub user IDs** from fixtures — cheap now, and keeps the corpus safe if the repo ever goes public.

- **M23: Extract client-side derivation rules with cross-language fixture tests.** The derivation rules for templates D/E/F/G ([[Decisions/Client-Side Derivation]]) are a second algorithm source-of-truth, living in `BallotScreen` — and unlike tabulation, they have no backend home and must be reimplemented in TypeScript. Before any ballot UI porting: run the existing Dart derivation logic against fixed inputs (scores, tie-break orders, K values), snapshot the outputs as fixtures, then implement a pure TS derivation module and require it to match every fixture in CI. M10 consumes this module rather than re-deriving inside components, and `simulate-counterfactual` (M20) can reuse it if it ever needs to re-derive payload fields. *(Numbered M23 because M1–M22 were already filed as issues; it belongs to Phase 0.)*

- **M3: Catalog behavioral parity requirements.** Scan closed bug issues (especially the recent #83–#86 cluster) and the [[Decisions/Client-Side Derivation]] doc to produce `docs/Migration/Parity Checklist.md`. This is the test plan for the React build — each entry is a behavior the new app must preserve, often learned from a past incident.

### Phase 1 — React Foundation

**Proposed issues:**

- **M4: Tech stack decision (RFC).** Choose React framework (Next.js App Router vs Vite + React Router vs Remix/Tanstack Start), state library (Zustand vs Jotai vs Tanstack Query alone), styling (Tailwind vs CSS Modules vs Panda), and component library posture (headless primitives like Radix + custom, or a full kit like shadcn). Document the decision in `docs/Migration/Tech Stack.md`. Constraints: must work cleanly with Supabase client libraries; must deploy on Cloudflare (Pages *or* Workers — note `next-on-pages` is deprecated and Cloudflare's supported SSR path is now Workers + OpenNext). On SSR: every `/election/:id` route is auth-gated today, so there is no crawlable public page at parity scope — SEO only becomes real with a future public elections directory. The RFC should decide explicitly whether to pay for SSR now or ship a Vite SPA at parity and defer SEO; either is acceptable, but it must be a conscious choice rather than an inherited constraint.

- **M5: Scaffold the React app and CI.** Repo structure (sibling folder, e.g., `web-react/`, alongside `lib/`), build pipeline, type-check, lint, test runner. Deploy a hello-world to a staging Cloudflare Pages project (e.g., `next.ez-vote.org`).

- **M6: Wire Supabase auth and session.** Email/password, OAuth (Google), OTP signup, redirect threading per [[Architecture/Auth Flow]]. Verify session persistence, anon → authenticated flows, and the `redirect=` query param threading through login → signup → OTP. At the start of this issue, add the staging domain to Supabase Auth's redirect allow-list and the Google OAuth console (and re-check auth email-template links at cutover) — these are easy to discover late and painful mid-flow.

- **M7: Design system and shared components.** Buttons, forms, inputs, typography, layout primitives. Match Flutter's visual identity initially to keep cutover non-jarring. Accessibility baked in (semantic HTML, focus management, ARIA where needed).

### Phase 2 — Surface Ports

Surfaces are listed roughly in order of difficulty and dependency. Read-only public surfaces first (lowest risk, highest visible win), mutation flows second, admin last.

**Proposed issues:**

- **M8: Port public results view.** Read-only, no mutations. Renders `result_data` for each algorithm per the structures in [[Backend/Edge Function]]. Verify against Flutter on every historical election. This surface is also the future entry point to the counterfactual feature, so getting it right early is high-leverage.

- **M9: Port election detail / dashboard.** Owner controls, participant view, candidate list. State transitions per [[Architecture/Ballot State Machine]].

- **M10: Port ballot / voting flow — all 7 templates.** Highest-risk surface. Consumes the derivation module from M23 (templates D/E/F/G) rather than re-deriving inside components. Must preserve tie-break order, drag/drop scoring with the auto-score-zero behavior (fixed in #83), and public-ballots flag handling. Every parity-checklist item touching the ballot must pass.

- **M11: Port election creation and edit flow.** Form-heavy. Algorithm selection, candidate management, feature flags (`include_fptp`, `realtime_results`, `public_ballots`, `allow_voter_candidates`), the title/subtitle rendering fixed in #86.

- **M12: Port invite voters flow.** Email invites, join link, QR code, "add from prior elections" per [[Features/Invite Voters]]. Realtime invitee state per #84.

- **M13: Port auth screens (landing, login, signup, forgot password) and info pages (privacy, terms, learn).** Lower risk than the voting flow but blocks cutover — these are public surfaces hit by external links.

- **M14: Port settings / account management.** Account deletion flow.

- **M15: Port realtime updates.** Supabase realtime subscriptions for results and invitees per [[Features/Realtime Results]]. Validate ordering and race-condition handling against the issues that motivated #84.

- **M16: Port election analysis card.** Cross-method comparison insights per [[Features/Election Analysis]]. The current implementation lives in `lib/domain/services/election_analysis_service.dart` and is computed client-side; the React port can do the same or move it to an edge function — decide as part of this issue.

### Phase 3 — Cutover

With no active user traffic, cutover is low-stakes; this phase is about disciplined verification, not traffic migration.

**Proposed issues:**

- **M17: Staging deployment and verification protocol.** **Completed before M19.** React was deployed at `next.ez-vote.org`, pointing at the same Supabase backend as Flutter. `docs/Migration/Cutover Plan.md` records the verification protocol and explicit exit criteria.

- **M18: Parity verification.** Run structured test elections end-to-end on the React app — every ballot template, every algorithm combination, invite flows, realtime, close-and-results. Diff results, ballot payloads, invitee state, and analysis output against the golden corpus and against the same flows performed in the Flutter app. Exit criteria are checklist-based, not time-based — every template and parity-checklist item passes, not "N weeks without defects."

- **M19: DNS cutover.** **Completed.** `ez-vote.org` now routes to the React `ez-vote-react` Pages project. Flutter remains deployable from rollback tag `flutter-pre-react-cutover` for the short post-cutover stability window.

### Phase 4 — Capstone and Decommission

- **M20: Build the `simulate-counterfactual` edge function.** Calls the shared tabulation helper (M1) with overridden ballot data. Returns recomputed results without persisting. Uses read-only DB credentials as a defense-in-depth guarantee against accidental mutation. Includes the "minimum changes to flip outcome" search.

- **M21: Build the counterfactual feature UI in React.** Data-viz heavy. Entry point from the ported results view (M8). This is the feature the migration was forcing-functioned by; shipping it on the React app vindicates the migration.

- **M22: Decommission Flutter.** After a short stability window post-cutover (a couple of weeks is plenty given no active traffic), remove the legacy Flutter Pages project/build pipeline. Update [[Architecture/Overview]] and all `lib/`-referencing docs to point at React equivalents.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Algorithm output drift between Flutter and React | M1 + M2: single backend helper + golden tests. Both clients call the same code. |
| Hard-won fixes silently re-introduced | M3 parity checklist as test plan for each surface port. |
| Client-side derivation logic ported incorrectly (templates D/E/F/G) | M23: derivation extracted to a pure TS module verified against Dart-generated fixtures before any UI port. M10 consumes the module instead of re-deriving. |
| Realtime race conditions re-invented (e.g., #84) | M15 calls out the specific issue history; M18 runs realtime flows in structured test elections. |
| Cutover breaks deep links shared in past elections | URL schema in [[Architecture/Overview]] is the contract; the React app must honor every route exactly. Auth redirect threading verified in M6. |
| "Two-stack forever" via stalled migration | Phased plan has explicit cutover gate (M19) and decommission step (M22). M18 has checklist-based exit criteria, not vibes. |
| Subtle behavior not captured by code or docs | M18 side-by-side comparison: perform the same flows in both apps and diff outcomes. Flutter is frozen, so the reference is stable. |

## Documentation Roadmap

**To be written during the migration:**

- `docs/Migration/Parity Checklist.md` (M3) — behaviors that must be preserved, sourced from closed bugs and design decisions.
- `docs/Migration/Tech Stack.md` (M4) — framework / library / styling decisions and rationale.
- `docs/Migration/Design System.md` (M7) — design tokens (the indigo M3 palette mapped to shadcn roles), the shared component inventory, and the a11y posture.
- `docs/Migration/Cutover Plan.md` (M17) — verification protocol, exit criteria, rollback procedure.

**To be updated:**

- [[Backend/Edge Function]] — after M1, to reflect the shared `tabulate` helper.
- [[Architecture/Overview]] — after M5 (add React app to the picture) and after M22 (remove Flutter).
- `docs/EZVote.md` — top-level index entry for the Migration section.
- `CLAUDE.md` — add brief context that an active migration is underway and point at this doc.

**Untouched (by design):**

- [[Backend/Schema]], [[Backend/RLS Policies]], [[Backend/RPC Functions]] — the migration is a client rewrite; the backend contract is stable.
- [[Decisions/Algorithm Design]], [[Decisions/Client-Side Derivation]] — these decisions remain in force across both stacks.
