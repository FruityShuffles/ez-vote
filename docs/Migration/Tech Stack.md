# Tech Stack (M4 RFC)

The framework, data, styling, and component decisions for the React build of EZVote, with rationale and the alternatives considered. This is the foundation issue of [[Migration/Overview]] Phase 1; every later surface port (M5–M16) assumes these choices.

**Status:** Decided.

## TL;DR

| Concern | Decision |
|---|---|
| Framework / rendering | **Vite + React Router — a client-rendered SPA. No SSR at parity scope.** |
| Server state | **TanStack Query** |
| Client state | **Zustand** (kept minimal — primarily the in-progress ballot) |
| Styling | **Tailwind CSS** |
| Components / a11y | **shadcn + headless primitives** (components copied into the repo and owned) — now **Base UI** (`@base-ui/react`), see note in Decision 4 |

All of these libraries are free and open-source — there are no licensing costs, and cost did not drive any choice except hosting (see Decision 1).

---

## Decision 1 — Framework & rendering: Vite SPA, defer SSR

**Decision:** Build a client-rendered Single Page Application with **Vite** (build tool) and **React Router** (routing). Do **not** adopt server-side rendering (SSR) at parity scope.

### Why

- **Nothing at parity scope is publicly crawlable.** Every content-bearing route — `/dashboard`, `/election/:id`, ballots, results, invite, settings — is auth-gated in `lib/config/router.dart`. The only public routes (`/`, `/learn`, `/privacy`, `/tos`, and the auth screens) are static and rarely change. SSR's headline benefit (SEO + fast first paint of *dynamic public content*) buys essentially nothing today.
- **It mirrors the legacy deployment.** Flutter shipped as a static build on **Cloudflare Pages**; the production React Vite SPA now deploys the same way (static assets → Pages CDN), retaining the `_redirects` SPA-routing trick and `--dart-define`-style build-time env injection rather than standing up new infrastructure.
- **Cloudflare's SSR path is now the costly one.** `next-on-pages` is deprecated; SSR on Next.js for Cloudflare now requires Workers + OpenNext — newer, more finicky infrastructure. SSR also runs a server program **per page view** (a metered, traffic-scaling compute model: Cloudflare Workers Paid is ~$5/mo beyond the free tier, then per-request), whereas the SPA stays effectively **$0/mo** on Pages as it does now. The cost picture reinforces the engineering one.
- **The counterfactual capstone does not need SSR.** Its computation lives server-side in the `simulate-counterfactual` **edge function** (M20), and its UI (M21) is heavily *interactive* data-viz — the part of any app that SSR helps least, since interactivity is identical client-side React under both models. SSR would add nothing to the feature that forced the migration.

### The one thing SSR would buy — and the escape hatch

The single capability a pure SPA cannot provide is **per-URL server-rendered HTML for public, shareable links** — i.e. rich link-preview ("unfurl") cards when a URL is pasted into Slack/Twitter/iMessage, which preview bots build from raw HTML meta tags without running JavaScript. This is the same underlying need as a future **public elections directory** or **publicly shareable counterfactual scenarios**: content that is public *and* machine-readable per URL. None of that exists at parity scope.

**Escape hatch (no rewrite required):** if/when public shareable links become real, server-rendering can be added for *only those specific public routes* — a small Cloudflare Pages Function / Worker that emits HTML + Open Graph meta tags for that one URL pattern — while the rest of the app remains a SPA. Deferring SSR is therefore a localized, additive future step, not a foreclosed door.

### Alternatives considered

- **Next.js (App Router) + Workers/OpenNext** — Pays for SSR now. Rejected: no crawlable dynamic content to justify it, deprecated/churny Cloudflare tooling, new deploy infrastructure, and a traffic-scaling hosting bill — all to serve a SEO benefit the auth-gated app can't use yet.
- **Remix / TanStack Start** — Also SSR-first, same "pay for SSR now" tradeoff as Next with a smaller Cloudflare deployment track record. Rejected for the same reason.

---

## Decision 2 — Data layer: TanStack Query + minimal Zustand

**Decision:** **TanStack Query** for server state; **Zustand** for the small amount of shared client state (chiefly the in-progress ballot draft).

### Why

- **It is a near-direct translation of the existing Riverpod design**, which de-risks the port. The current app ([[Architecture/Overview]]) is built on ~12 data providers with a **fetch → cache → invalidate-on-mutation** discipline. TanStack Query expresses exactly that: a `FutureProvider.family(id)` becomes a query keyed `['election', id]`; `ref.invalidate(provider)` becomes `queryClient.invalidateQueries(...)`. The migration becomes "re-express a trusted pattern," not "redesign."
- **Server vs. client state are different problems.** ~90% of EZVote's state is borrowed copies of database rows (elections, candidates, ballots, results) — TanStack Query owns caching, background refetch, loading/error states, and retries for those. The remainder is browser-only state (open sheets, and the fiddly **in-progress ballot** with tie-break ordering per BAL-03/04) — Zustand is a tiny store that is the right home for the ballot draft shared across components.
- **Realtime fits cleanly.** Supabase realtime subscriptions (M15) push into the Query cache via `setQueryData` / targeted invalidation, preserving the parity-checklist §9 guarantees as observable behavior rather than porting Flutter's timer mechanics.

### Alternatives considered

- **TanStack Query alone (no Zustand)** — Viable; client state via `useState`/Context. Rejected as the default because the ballot draft is a genuine state machine (drag-reorder, auto-score-to-zero, tie-breaks surviving score changes) that tends to tangle when many components share one evolving object in Context. Not a one-way door — Zustand is deliberately minimal and can be the only added store.
- **Zustand/Jotai-centric (no Query)** — Hand-rolls server caching/invalidation in a client store. Rejected: re-implements (worse) what Query gives free and discards the clean mapping from the current Riverpod architecture.

---

## Decision 3 — Styling: Tailwind CSS

**Decision:** **Tailwind CSS** (utility classes + a central design-token config).

### Why

- **Centralized design identity.** Flutter's current theme (colors, spacing, type) maps to Tailwind design tokens defined once in config; every utility reads from them, making it straightforward to match the existing look (M7) and stay consistent — important for a non-jarring cutover.
- **Standard, well-trodden, and the natural partner to Decision 4.** Tailwind is the de-facto default with abundant examples, and shadcn components ship styled with Tailwind — the two choices reinforce each other.

### Alternatives considered

- **CSS Modules** — Scoped plain CSS; familiar markup but more boilerplate (file-hopping, hand-named classes), no built-in token system, and a weaker fit with the shadcn component approach.
- **Panda CSS** — Modern and type-safe, but a smaller ecosystem and more setup overhead — not worth the friction for a parity rewrite that benefits from well-trodden paths.

---

## Decision 4 — Components & accessibility: shadcn + headless primitives

**Decision:** **shadcn**-assembled headless primitives (component source copied into the repo and owned, styled with Tailwind), for expert-grade accessibility we style ourselves.

> **Implementation note (added during M5 scaffold, 2026-06-13):** the actual decision here is the *posture* — **headless primitives + owned source via shadcn**, chosen over a full styled kit (MUI/Mantine) and over fully-custom headless-only. The RFC named **Radix** as those primitives because "shadcn" had been synonymous with Radix-based for years. When `npx shadcn@latest` (v4.11) was first run in M5, its current default style (`base-nova`) is built on **Base UI** (`@base-ui/react`) — the headless library from a maintainer team overlapping Radix/Floating UI, i.e. Radix's spiritual successor — not Radix. We adopted Base UI rather than pinning an older shadcn major to force Radix, because it stays on shadcn's maintained/default path and satisfies the same a11y rationale below verbatim. The ballot's hardest interactions (drag-reorder, tie-breaks, auto-score-zero — checklist §4) are custom and do not ride on these primitives regardless of which library backs them. The text below reads "Radix" historically; "Base UI" is the concrete library in the repo.

### Why

- **It delivers the migration's central justification.** Accessibility is the #1 reason for leaving Flutter's canvas rendering ([[Migration/Overview]]). Correct keyboard navigation, focus management, and screen-reader semantics for menus/dialogs/tabs/etc. are hard and easy to get subtly wrong; Radix provides them as solved, unstyled primitives. We inherit expert-grade a11y and bring our own (Tailwind) styling.
- **Full control of the highest-risk surface.** shadcn copies component *source* into the repo rather than hiding it behind a dependency, so the ballot's bespoke drag-to-reorder / tie-break / auto-score interactions (parity checklist §4) are ours to edit directly — no fighting a library's assumptions on the surface where precision matters most.
- **Pairs with Decisions 1–3** — headless + Tailwind + owned source is the standard, low-lock-in combination, all free.

### Alternatives considered

- **Full kit (MUI / Mantine)** — Fastest day-one start, but ships an opinionated visual style that is harder to bend to Flutter's identity, is heavier, and gets in the way precisely on the custom, high-stakes ballot interactions. Rejected: "fast to start, fights you on the thing that matters most" is a poor trade for a voting app.
- **Fully custom / headless-only (no shadcn)** — Maximum control, but puts all the accessibility work — the migration's core goal — back on us with the most effort and the most risk of quiet a11y regressions. Rejected.

---

## Consequences for later issues

- **M5 (scaffold):** Vite + React Router + TypeScript app under a sibling folder (e.g. `web-react/`); Tailwind + shadcn initialized; TanStack Query provider at the root; deploy a hello-world to a staging Cloudflare **Pages** project. Build-time Supabase env injection mirrors the current `--dart-define` approach.
- **M6 (auth):** _Shipped._ `AuthProvider` + `useAuth()` track the Supabase session (the `authStateProvider` replacement, live for DET-02); `RequireAuth` / `RedirectIfAuthed` guards reproduce the `redirect=` threading in `router.dart` (AUTH-01), with post-auth navigation driven by the guard reacting to the session change (avoids a `navigate()`-vs-session-propagation race). `safeRedirect` hardens the Flutter check by also rejecting protocol-relative URLs and auth-route targets. Google OAuth threads the validated deep-link destination through `redirectTo` (a deliberate UX improvement over Flutter, which always returned to `/dashboard`). Auth screens are functional-only here; M7/M13 restyle them. _Config (set out-of-band): add `localhost:5173` + the staging origin to Supabase Auth's redirect allow-list and the Google OAuth console (AUTH-02); re-check email-template links at cutover._
- **M7 (design system):** _Shipped._ Tailwind tokens are the Material 3 `ColorScheme.fromSeed(Colors.indigo)` palette mapped to shadcn's semantic roles (light-only at parity; dark scheme retained for a future toggle). Shared components are owned source on the `base-nova`/Base UI primitives, styled to the tokens, with a11y wiring tested; the bespoke ballot widgets are deferred to M10. Auth screens are restyled onto the system, and `/design` is an internal gallery for visual verification. See [[Migration/Design System]].
- **M8–M16 (surfaces):** each query key mirrors a current provider; mutations invalidate the matching keys; realtime (M15) writes into the Query cache.
- **Future public/shareable surfaces (post-parity):** add per-route server-rendering (Cloudflare Pages Function/Worker emitting Open Graph HTML) for just those routes — per the Decision 1 escape hatch — without converting the app to SSR.
