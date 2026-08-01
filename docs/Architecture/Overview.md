# Architecture Overview

EZVote is a client-rendered React SPA in `web-react/`, backed by Supabase (Postgres + Auth + Edge Functions). It deploys as static assets to the `ez-vote-react` Cloudflare Pages project and serves `https://ez-vote.org`; `https://next.ez-vote.org` and `https://ez-vote-react.pages.dev` are aliases of the same deployment, not separate environments.

| Concern | Implementation |
|---|---|
| Build / rendering | Vite + React Router SPA (`_redirects` fallback for deep links, `_headers` for security headers) |
| Server state | TanStack Query — one query-key factory per domain area |
| Client state | Zustand (minimal — chiefly the counterfactual edit ledger) |
| Styling | Tailwind CSS |
| Components / a11y | shadcn + Base UI primitives, owned source in `src/components/ui/` |
| Env / credentials | Vite build-time `import.meta.env.VITE_SUPABASE_*` |

Rationale for each choice is in [[Migration/Tech Stack]]; design tokens and the component inventory are in [[Migration/Design System]].

## Layout

```
web-react/src/
  router.tsx          → nested route table + per-route content widths
  components/RootLayout.tsx, AppLayout.tsx → scroll/focus/error + protected chrome
  routes/             → one file per screen
  components/         → presentational components, grouped by surface
    ui/               → owned shadcn / Base UI primitives
  lib/                → data hooks, pure logic, the Supabase client
  auth/               → session context, route guards, redirect threading
  stores/             → Zustand client state
supabase/functions/
  _shared/            → tabulate.ts + derive.ts, the algorithm sources of truth
```

Screens don't call Supabase directly — they go through the hooks in `src/lib/`, which own the query keys and the mutation/invalidation pairs. Parity-critical logic (ballot state, derivation, analysis) is kept in pure, React-free modules so it can be unit-tested directly against fixtures.

## Data Flow

```
Supabase JS client (src/lib/supabase.ts)
  → data hook (src/lib/elections.ts, results.ts, ballot.ts)
    → TanStack Query cache, keyed by electionKeys / resultsQueryKey
      → route or component (isPending / isError / data)
```

After a mutation, its `onSuccess` calls `qc.invalidateQueries({ queryKey: … })` to trigger a refetch. There is no manual state sync — invalidation drives everything, exactly as provider invalidation did before.

## Query Keys

All election keys come from the `electionKeys` factory in `src/lib/elections.ts`; results have their own `resultsQueryKey` in `src/lib/results.ts`.

| Hook | Query key | What it fetches |
|---|---|---|
| `useOwnedElections()` | `['elections','owned']` | Elections owned by the current user |
| `useVotedElections()` | `['elections','voted']` | Elections where the user cast a ballot |
| `usePendingInvitations()` | `['elections','pending-invitations']` | Open elections with unaccepted invites |
| `useElection(id)` | `['election', id]` | Single election by id |
| `useCandidates(id)` | `['candidates', id]` | Candidates for an election |
| `useExistingBallot(id)` | `['existing-ballot', id]` | User's existing ballot (null if none) |
| `useBallotCount(id)` | `['ballot-count', id]` | Number of ballots cast |
| `useElectionVoters(id)` | `['voters', id]` | Voter display names |
| `usePendingInvitees(id)` | `['pending-invitees', id]` | Users with pending invites |
| `usePriorCovoters(id)` | `['prior-covoters', id]` | Users who voted with the current user elsewhere |
| `usePublicBallots(id)` | `['public-ballots', id]` | Ballots when `public_ballots` is enabled |
| `useElectionResults(id)` | `['results', id]` | Computed results per algorithm |

Mutation hooks live beside them and invalidate the keys they affect — `useSaveElection`, `useOpenElection`, `useCloseElection`, `useAddCandidate`, `useAddVoterToElection`, `useJoinElection`, `useDeleteElection`, `useUpsertBallot`.

`useElection(id)` and `useCandidates(id)` each use a 30-second `staleTime`, so moving among an election's overview, ballot, edit form, and explorer reuses the shared cache instead of refetching on every observer remount. This is only a navigation freshness window: mutation and realtime invalidation still marks either query stale and refetches active observers immediately, while TanStack Query's default focus/remount behavior refreshes data once the window expires. Candidate polling and the ballot's pre-submit fetch remain the stronger live-safety gates for ad-hoc candidates.

Every list above is user-scoped, resolved through `requireUserId()`. Because the `QueryClient` is process-global, `AuthProvider` clears the whole cache on an actual account change — see [[Auth Flow]] → "Auth State in the App".

## Client State

Zustand, kept deliberately small:

- `src/stores/uiStore.ts` — trivial global UI state.
- `src/lib/counterfactualStore.ts` — the election-scoped reversible edit ledger for the what-if explorer ([[Features/Counterfactual Explorer]]).

Election form drafts are the one reload-safe exception to in-memory client state. `src/lib/electionDrafts.ts` stores them in browser local storage under `draft:create` or `draft:edit:<id>` and expires them after seven days. Edit drafts record the election's source `updated_at` and are restored only when it still matches the freshly loaded server row; saving clears the corresponding local draft.

The in-progress ballot is component state via `useBallotState`, not a global store — see [[Ballot State Machine]].

## Routing

`createBrowserRouter` in `src/router.tsx` (history API — no `#` fragments). The Cloudflare Pages `_redirects` rule (`/* /index.html 200`) rewrites unknown paths to `index.html` so deep links resolve client-side.

The route table is nested without changing any URL. `RootLayout` wraps every route and owns one `ScrollRestoration`, pathname-only focus management, and the root error boundary. A pathless `AppLayout` wraps the protected branch, applies `RequireAuth` once around the app shell and `<Outlet>`, and provides a second error boundary. Auth routes remain outside that branch so their full-page cards cannot enter an auth redirect loop.

The authenticated app bar is global but deliberately limited to **Settings** and **Sign out**. **New Election** remains dashboard-only so it never appears during a ballot or edit flow. Route `handle.width` values set the content container width (`sm` ballot, `md` standard, `lg` explorer) while the app-bar container remains `lg`; global navigation therefore does not narrow with route content.

Returnable UI state is addressable. Dashboard selection uses `?tab=owned|votes|learn` (unknown values render `owned`), and the submitted-voters dialog on an election overview uses `?voters=open`. Both preserve unrelated parameters. Public-ballot links and paging carry an explicit `location.state.from = 'voters'` marker so Back returns to the open dialog without adding a ballot/overview loop; cold ballot deep links replace to the concrete `?voters=open` overview.

`election/:id` is a gate-free namespace. Its `join` child sits directly beneath the namespace so the join RPC can run before RLS grants election-read access. A sibling pathless `ElectionWorkspace` gates every display child (`index`, `vote`, `edit`, public ballot, and explorer) on `useElection(id)`, then provides the resolved election through outlet context; candidates remain child-owned and `useElectionRealtime` remains detail-only.

Breadcrumbs are derived from matched route handles in `AppLayout`. The workspace match owns the subscribed election crumb (and therefore never appears on `/join`); deeper handles add the current page and content width. The top crumb derives from ownership on a cold URL — **My Elections** for the owner, **My Votes** for participants — while the final crumb carries `aria-current="page"`. Public-ballot breadcrumb navigation honors the same marked-history/cold-link fallback as the voters flow.

| Path | Route component | Access |
|---|---|---|
| `/` | `Home` | Public |
| `/learn`, `/privacy`, `/tos` | `Learn`, `Privacy`, `Terms` | Public |
| `/login` | `Login` | `RedirectIfAuthed` |
| `/signup` | `Signup` | `RedirectIfAuthed` |
| `/forgot-password` | `ForgotPassword` | `RedirectIfAuthed` |
| `/dashboard` | `Dashboard` | `RequireAuth` |
| `/create` | `ElectionForm` | `RequireAuth` |
| `/election/:id` | `ElectionDetail` | `RequireAuth` |
| `/election/:id/edit` | `ElectionForm` (edit mode) | `RequireAuth` |
| `/election/:id/vote` | `Ballot` | `RequireAuth` |
| `/election/:id/ballot/:index` | `PublicBallot` | `RequireAuth` |
| `/election/:id/explore` | `CounterfactualPicker` | `RequireAuth` |
| `/election/:id/explore/:voterId` | `CounterfactualEditor` | `RequireAuth` |
| `/election/:id/join` | `JoinElection` | `RequireAuth` |
| `/settings` | `Settings` | `RequireAuth` |
| `/design`, `/design/explore` | `Design`, `DesignExplore` | Unlinked, unguarded, lazy-loaded design surfaces |
| `*` | `NotFound` | — |

The public paths and the `/election/:id/...` shapes are a stability contract: they were preserved verbatim across the React cutover so links shared in past elections keep resolving.

Production screen modules are route-lazy; only the root/app layouts, auth guard, election workspace, breadcrumbs, and error boundaries stay in the initial bundle. `RootLayout` renders a `useNavigation()` progress bar during chunk transitions, and the root route's `hydrateFallbackElement` supplies a full-shell fallback for the first lazy chunk on a cold deep link. Server-data loading remains owned by TanStack Query inside each screen. Lazy import failures reach the existing root or authenticated-app `errorElement` rather than React Router's default error screen.

**Auth redirect:** unauthenticated users go to `/login?redirect=<encoded-path>`; on sign-in the param is resolved by `safeRedirect` and honored. It threads through the entire login → signup → OTP chain. The single guard on the protected layout, not a central redirect callback, drives this — see [[Auth Flow]].

## Environment / Credentials

`src/lib/supabase.ts` reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Vite **inlines these at build time**, so the values are fixed by whichever `.env` was present when `npm run build` ran — not by runtime configuration. CI builds with dummy values (it only needs them well-formed); production releases build locally against the real `web-react/.env`. See `web-react/README.md`.

**Email:** Resend is configured as custom SMTP in Supabase (Authentication → Settings → SMTP) to bypass free-tier email rate limits. There is no Resend SDK in the codebase — Supabase sends OTP/auth emails through Resend transparently.

## Screen Inventory

| Route file | Purpose |
|---|---|
| `Home.tsx` | Unauthenticated landing page with CTA |
| `Login.tsx` | Email/password sign-in + Google OAuth |
| `Signup.tsx` | Email/password/display name + OTP verification |
| `ForgotPassword.tsx` | Two-stage OTP password recovery |
| `Dashboard.tsx` | 3-tab dashboard: My Elections, My Votes, Learn |
| `ElectionForm.tsx` | Create or edit an election (algorithms, candidates, feature flags) |
| `Ballot.tsx` | Vote interface — 7 templates |
| `PublicBallot.tsx` | Read-only view of another voter's ballot |
| `CounterfactualExplorer.tsx` | What-if picker + editor |
| `JoinElection.tsx` | Quick-join redirect screen |
| `Settings.tsx` | Account settings, delete account |
| `Learn.tsx` | Voting-method educational content |
| `Privacy.tsx`, `Terms.tsx` | Static info pages |
| `Design.tsx`, `DesignExplore.tsx` | Internal design-system galleries |

`ElectionDetail` (owner controls, participant view, candidate list, results) lives in `src/components/elections/ElectionDetail.tsx` and is routed directly. `ResultsView` (`src/components/results/ResultsView.tsx`) renders the algorithm-by-algorithm result cards plus the analysis card.

## CI and Release

- `.github/workflows/web-react-ci.yml` — lint, type-check, Vitest, and a production build on any `web-react/**` change.
- `.github/workflows/tabulate-tests.yml` — the Deno golden corpus for `_shared/tabulate.ts` and `_shared/derive.ts`.
- Releases are direct Wrangler uploads from a clean `main` to the `ez-vote-react` production branch. The full procedure is in `web-react/README.md`.
