# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GitHub Issues Workflow

Use `gh` CLI (authenticated) to manage work from the GitHub issue tracker at `https://github.com/FruityShuffles/ez-vote`.

**Priority order**: bugs first, then enhancements.

**Typical session** (triggered by "work on issues" or "work on issue #N"):
1. `gh issue list --label bug` first, then `gh issue list` for enhancements if no bugs remain
2. `gh issue view <N> --comments` to read the full issue including follow-up posts
3. Enter plan mode for non-trivial work — pause and wait for user approval before touching code
4. Implement, then commit referencing the issue (e.g., `Fix #4: ...`)
5. Close the issue with `gh issue close <N> -c "Fixed in <commit-sha>"` — no need to ask
6. Loop back to step 1 and continue with the next issue without waiting for the user

**Only stop when**: plan approval is needed, you hit an ambiguity that requires a decision, or there are no more open issues.

## Build & Development Commands

```bash
# Install dependencies
flutter pub get

# Generate JSON serialization code (run after modifying models)
flutter pub run build_runner build --delete-conflicting-outputs

# Analyze/lint
flutter analyze

# Run for web
flutter run -d chrome

# Deploy edge function (requires `supabase login` and `supabase link` first)
# --no-verify-jwt is required because the Supabase gateway rejects ES256 user JWTs;
# auth is verified inside the function itself via supabase client getUser()
supabase functions deploy compute-results --no-verify-jwt

# Push database migrations
supabase db push
```

Flutter is installed at `C:\Users\adria\flutter\bin\flutter.bat`.

## Architecture

Three-layer clean architecture: **data** → **domain** → **presentation**.

### Data Flow
Supabase SDK → Repository (`lib/data/repositories/`) → Riverpod Provider (`lib/presentation/providers/providers.dart`) → Screen `.when(loading, error, data)`

Provider invalidation (`ref.invalidate(provider)`) triggers refetch after mutations. Auth state uses `StreamProvider`. Data providers are `FutureProvider` (or `FutureProvider.family` when parameterized by election ID).

### Routing
GoRouter in `lib/config/router.dart`. Uses `usePathUrlStrategy()` in `main.dart` for clean path-based URLs (no `#` hash) — this is required for deep links to work on web.

Auth redirect logic: unauthenticated users go to `/login?redirect=<encoded-path>`, authenticated users on auth routes redirect to the `redirect` param or `/`. All auth transitions navigate explicitly via `context.go()` — there is no `refreshListenable`.

Navigation conventions: `context.push()` for forward nav (preserves back stack), `context.go()` after auth changes (replaces history).

### Multi-Algorithm Voting
A single election has multiple voting algorithms (approval, IRV, STAR). Ballots store all algorithm data in one JSONB `payload` field with keys per algorithm (`approval`, `irv`, `star`). The edge function (`supabase/functions/compute-results/index.ts`) computes results for each algorithm independently and upserts one result row per algorithm.

### Ballot Screen Templates
`lib/presentation/screens/ballot_screen.dart` dispatches one of 7 templates (A–G) based on which algorithms are enabled:

| Template | Algorithms | UI |
|----------|-----------|-----|
| A | IRV | Reorderable list for direct ranking |
| B | STAR | Score chips (0–5) per candidate |
| C | Approval | Checkboxes |
| D | IRV + Approval | Reorderable list + top-K stepper |
| E | STAR + Approval | Score chips + cutoff stepper (`>= _approvalCutoff`) |
| F | STAR + IRV | Score chips; IRV ranks auto-derived; tie-break drag UI |
| G | STAR + IRV + Approval | Score chips; ranks + approvals auto-derived |

Key invariants when modifying this file:
- **Scores are source of truth** when STAR is present; IRV rankings and approvals are derived, not directly edited
- **`_syncTieBreaks()`** must be called after every score change to keep tie-break state consistent; score-0 ties are excluded and auto-resolved
- **Approval derivation** differs by template: E uses score cutoff, D/G use top-K on the ranking
- **`_mergeNewCandidates()`** updates state maps when ad-hoc candidates are added/removed mid-ballot

### Ad-Hoc Candidate Polling
When `allowVoterCandidates` is enabled, both the election detail screen and ballot screen poll for candidate changes using `Timer.periodic` (10s interval). The pattern:
1. Fetch fresh candidate count via `candidateRepository.countForElection()` (lightweight, selects IDs only)
2. Compare with cached `candidatesProvider` length
3. Only invalidate the provider if counts differ — avoids loading-state flash when nothing changed
4. On the ballot screen, new candidates are merged into existing state via `_mergeNewCandidates()` without losing the voter's in-progress scores/rankings
5. On submit, a final pre-submit gate blocks if candidates changed and merges before requiring the voter to review

### Supabase Backend
- **RLS policies** enforce access control (owners vs voters who joined or accepted invites)
- **RPC functions**: `accept_invite` (token-based invite), `join_election` (open elections), `delete_current_user` (nullifies ballots, deletes profile + auth user), `get_ballot_count` (security-definer count for ballot display)
- **Security-definer helpers**: `current_user_owns_election()` and `election_allows_voter_candidates()` avoid RLS infinite recursion when checking election ownership/settings inside policies
- **Edge Function** `compute-results` runs Approval/IRV/STAR algorithms server-side, closes the election
- **Triggers**: `on_auth_user_confirmed` (email flow) and `on_auth_user_created` (Google OAuth) both call `handle_new_user()` to upsert a `profiles` row; idempotent via `ON CONFLICT DO NOTHING`
- **pg_cron**: deletes elections older than 60 days at 3 AM daily
- SQL migrations in `supabase/migrations/` — deploy with `supabase db push` (CLI migration history is synced; no need to run manually via dashboard)

### Auth Flow
Signup is a two-phase flow: email/password registration, then 8-digit OTP code verification. The `redirect` query param is passed between `/login` and `/signup` screens to preserve deep links through the entire auth flow. OTP verification triggers the `handle_new_user` DB trigger that creates the profile row.

### Models
Domain models in `lib/domain/models/` use `@JsonSerializable()` with generated `.g.dart` files. Field names map to Supabase snake_case columns via json_serializable defaults.

### Environment
- **Local dev**: `.env` file (gitignored) with `SUPABASE_URL` and `SUPABASE_ANON_KEY`, loaded via `flutter_dotenv`
- **Production**: credentials injected via `--dart-define` at build time; `lib/config/supabase_config.dart` resolves `String.fromEnvironment()` first, falls back to `.env`
- **Email**: Resend is configured as custom SMTP in Supabase (Authentication → Settings → SMTP) to bypass the free-tier email rate limits. No Resend SDK in the codebase — Supabase sends OTP/auth emails through Resend transparently.

### Deployment
- **Hosting**: Cloudflare Pages, production domain `ez-vote.org` (not Workers — no `wrangler.toml`)
- **SPA routing**: configured at Cloudflare Pages level (catch-all `/* → /index.html 200`)
- **Cache headers**: `web/_headers` sets `Cache-Control: no-store` on `index.html` and `flutter_service_worker.js`
- **Build command**: clones Flutter 3.41.0, runs `flutter build web` with `--dart-define` for Supabase credentials
- **Env vars**: set in Cloudflare Pages dashboard (`SUPABASE_URL` as text, `SUPABASE_ANON_KEY` as secret)
