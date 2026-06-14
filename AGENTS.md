# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Documentation

Project documentation lives in `docs/`. Before working on any issue or task, always check `docs/` for relevant files and read them. After making changes that affect architecture, schema, features, or the ballot screen, update the relevant docs.

## Active Migration

A Flutter → React migration is underway. See `docs/Migration/Overview.md` for the plan; issues are filed under the "React migration" milestone. The Flutter app is frozen — no further Flutter development (no bug fixes, no features); all work happens on the React side. Flutter stays deployed only as the parity reference until cutover; bugs found in it are recorded in the parity checklist, not patched in Dart.

## GitHub Issues Workflow

Use `gh` CLI (authenticated) to manage work from the GitHub issue tracker at `https://github.com/FruityShuffles/ez-vote`.

**Priority order**: bugs first, then enhancements.

**Typical session** (triggered by "work on issues" or "work on issue #N"):
1. `gh issue list --label bug` first, then `gh issue list` for enhancements if no bugs remain
2. `gh issue view <N>` to read the issue body and check the `comments:` count. If that count is > 0, also run `gh issue view <N> --comments` to read the follow-up posts (the `--comments` flag prints **only** comments, not the body, and produces empty output when the count is 0).
3. Enter plan mode for non-trivial work — pause and wait for user approval before touching code
4. Implement the changes
5. Commit with the GitHub closing keyword: `Fix #N: ...`.
6. Immediately push the commit. Pushing `Fix #N: ...` to `main` auto-closes the referenced issue.
7. Loop back to step 1 and continue with the next issue without waiting for the user

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

