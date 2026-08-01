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
  router.tsx          → route table + auth guards
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

Every list above is user-scoped, resolved through `requireUserId()`. Because the `QueryClient` is process-global, `AuthProvider` clears the whole cache on an actual account change — see [[Auth Flow]] → "Auth State in the App".

## Client State

Zustand, kept deliberately small:

- `src/stores/uiStore.ts` — trivial global UI state.
- `src/lib/counterfactualStore.ts` — the election-scoped reversible edit ledger for the what-if explorer ([[Features/Counterfactual Explorer]]).

The in-progress ballot is component state via `useBallotState`, not a global store — see [[Ballot State Machine]].

## Routing

`createBrowserRouter` in `src/router.tsx` (history API — no `#` fragments). The Cloudflare Pages `_redirects` rule (`/* /index.html 200`) rewrites unknown paths to `index.html` so deep links resolve client-side.

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

**Auth redirect:** unauthenticated users go to `/login?redirect=<encoded-path>`; on sign-in the param is resolved by `safeRedirect` and honored. It threads through the entire login → signup → OTP chain. Guards, not a central redirect callback, drive this — see [[Auth Flow]].

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
