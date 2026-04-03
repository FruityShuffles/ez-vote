# Architecture Overview

## Three-Layer Clean Architecture

```
Data Layer        → lib/data/repositories/
Domain Layer      → lib/domain/models/, lib/domain/services/
Presentation      → lib/presentation/screens/, /providers/, /widgets/
```

Data never flows upward. Screens never call repositories directly — they go through Riverpod providers.

## Data Flow

```
Supabase SDK
  → Repository (lib/data/repositories/)
    → Riverpod Provider (lib/presentation/providers/providers.dart)
      → Screen (.when(loading, error, data))
```

After a mutation, call `ref.invalidate(provider)` to trigger a refetch. There is no manual state sync — invalidation drives everything.

## Provider Taxonomy

All providers live in `providers.dart`.

**Infrastructure:**
- `supabaseClientProvider` — SupabaseClient singleton
- `authStateProvider` — `Stream<AuthState>`; the root of all auth-dependent state
- `currentUserProvider` — `User?` extracted from auth stream

**Repository providers** — one per repository, created via `Provider`

**Data providers** — `FutureProvider` or `FutureProvider.family` (parameterized by election ID):

| Provider | Type | What it fetches |
|---|---|---|
| `ownedElectionsProvider` | FutureProvider | Elections owned by current user |
| `votedElectionsProvider` | FutureProvider | Elections where user cast a ballot |
| `pendingInvitationsProvider` | FutureProvider | Open elections with unaccepted invites |
| `electionProvider(id)` | FutureProvider.family | Single election by ID |
| `candidatesProvider(id)` | FutureProvider.family | Candidates for an election |
| `invitesProvider(id)` | FutureProvider.family | Invites sent for an election |
| `existingBallotProvider(id)` | FutureProvider.family | User's existing ballot (null if none) |
| `resultsProvider(id)` | FutureProvider.family | Computed results per algorithm |
| `ballotCountProvider(id)` | FutureProvider.family | Number of ballots cast |
| `electionVotersProvider(id)` | FutureProvider.family | Voter display names |
| `pendingInviteesProvider(id)` | FutureProvider.family | Users with pending invites |
| `priorCovotersProvider(id)` | FutureProvider.family | Users who voted with current user elsewhere |

All data providers watch `authStateProvider` and invalidate on user change.

## Routing

GoRouter in `lib/config/router.dart`. `usePathUrlStrategy()` in `main.dart` enables clean paths (no `#`).

**Named routes:**

| Path | Screen | Access |
|---|---|---|
| `/` | LandingScreen | Public |
| `/login` | LoginScreen | Public |
| `/signup` | SignupScreen | Public |
| `/dashboard` | HomeScreen | Auth required |
| `/create` | CreateElectionScreen | Auth required |
| `/election/:id` | ElectionDetailScreen | Auth + participant |
| `/election/:id/edit` | CreateElectionScreen (edit mode) | Owner only |
| `/election/:id/vote` | BallotScreen | Auth + participant |
| `/election/:id/join` | JoinElectionScreen | Auth required |
| `/election/:id/invite` | InviteVotersScreen | Owner only |
| `/settings` | SettingsScreen | Auth required |
| `/privacy`, `/tos`, `/learn` | Info screens | Public |

**Auth redirect:** Unauthenticated users go to `/login?redirect=<encoded-path>`. On successful login, the `redirect` param is decoded and used for `context.go()`. The param threads through the entire signup flow too — login → signup → OTP verification all preserve it.

**Navigation conventions:**
- `context.push()` — forward navigation (preserves back stack)
- `context.go()` — post-auth transitions (replaces history)

No `refreshListenable` on the router. Auth transitions are handled by explicit `context.go()` calls inside auth callbacks.

## Environment / Credentials

`lib/config/supabase_config.dart` resolves credentials in priority order:
1. `String.fromEnvironment('SUPABASE_URL')` — baked in at build time via `--dart-define`
2. `.env` file loaded via `flutter_dotenv` — local dev fallback

`main.dart` wraps Supabase init in try/catch and shows a red error screen if credentials are missing, so misconfiguration is immediately visible.

**Email:** Resend is configured as custom SMTP in Supabase (Authentication → Settings → SMTP) to bypass free-tier email rate limits. There is no Resend SDK in the codebase — Supabase sends OTP/auth emails through Resend transparently.

## Screen Inventory

| Screen | Purpose |
|---|---|
| LandingScreen | Unauthenticated homepage with CTA |
| LoginScreen | Email/password signin + Google OAuth |
| SignupScreen | Email/password/display name + OTP verification |
| HomeScreen | 3-tab dashboard: My Elections, My Votes, Learn |
| CreateElectionScreen | Create or edit election (algorithms, candidates, feature flags) |
| ElectionDetailScreen | View election, results, candidate list, owner controls |
| BallotScreen | Vote interface — 7 templates |
| InviteVotersScreen | Email invite management |
| JoinElectionScreen | Quick join redirect screen |
| SettingsScreen | Account settings, delete account |
| ResultsView (widget) | Algorithm-by-algorithm results cards |
| LearnScreen | Voting method educational content |
