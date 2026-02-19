# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

Flutter is installed at `C:\Users\adria\flutter\bin\flutter.bat`.

## Architecture

Three-layer clean architecture: **data** → **domain** → **presentation**.

### Data Flow
Supabase SDK → Repository → Riverpod FutureProvider → Screen `.when(loading, error, data)`

Provider invalidation (`ref.invalidate(provider)`) triggers refetch after mutations. Auth state uses StreamProvider.

### Routing
GoRouter in `lib/config/router.dart` with auth redirect: unauthenticated users go to `/login`, authenticated users on auth routes redirect to `/`. Routes use `context.push()` for forward nav, `context.go()` after auth changes.

### Multi-Algorithm Voting
Core concept: a single election has multiple voting algorithms (approval, IRV, STAR). Ballots store all algorithm data in one JSONB `payload` field with keys per algorithm. The edge function (`supabase/functions/compute-results/index.ts`) computes results for each algorithm independently and upserts one result row per algorithm.

### Supabase Backend
- **RLS policies** enforce access control at the database level (owners vs invited voters)
- **RPC function** `accept_invite` handles token-based invite acceptance (security definer)
- **Edge Function** `compute-results` runs Approval/IRV/STAR algorithms server-side, closes the election
- SQL migrations in `supabase/migrations/` (run in order via Supabase dashboard SQL editor)

### Models
Domain models in `lib/domain/models/` use `@JsonSerializable()` with generated `.g.dart` files. Field names map to Supabase snake_case columns via json_serializable defaults.

### Environment
`.env` file (gitignored) with `SUPABASE_URL` and `SUPABASE_ANON_KEY`, loaded via `flutter_dotenv` in `main.dart`.
