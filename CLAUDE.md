# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Project documentation lives in `docs/`. Before working on any issue or task, always check `docs/` for relevant files and read them. After making changes that affect architecture, schema, features, or the ballot screen, update the relevant docs.

## Active Migration

A Flutter → React migration is the active priority. See `docs/Migration/Overview.md` for the full plan, phased approach, and risks. Issues M1–M22 are filed as GitHub #87–#108 under the "React migration" milestone. **M1 (#87) is the immediate next step** — it extracts the voting algorithms from `compute-results` into a shared helper that both stacks call, and is prerequisite for most of the rest of the plan. Until cutover (M19), the live Flutter app remains in production and Flutter-side bugs are still fixed against it.

## GitHub Issues Workflow

Use `gh` CLI (authenticated) to manage work from the GitHub issue tracker at `https://github.com/FruityShuffles/ez-vote`.

**Priority order**: bugs first, then enhancements.

**Typical session** (triggered by "work on issues" or "work on issue #N"):
1. `gh issue list --label bug` first, then `gh issue list` for enhancements if no bugs remain
2. `gh issue view <N>` to read the issue body and check the `comments:` count. If that count is > 0, also run `gh issue view <N> --comments` to read the follow-up posts (the `--comments` flag prints **only** comments, not the body, and produces empty output when the count is 0).
3. Enter plan mode for non-trivial work — pause and wait for user approval before touching code
4. Implement the changes
5. **Codex review**: for non-trivial changes (new features, refactors, security-sensitive code, or anything touching core voting logic), run `codex` with a prompt describing what changed and asking for a review of correctness, edge cases, and bugs. Address any issues found before committing.
6. Commit referencing the issue (e.g., `Fix #4: ...`)
7. Close the issue with `gh issue close <N> -c "Fixed in <commit-sha>"` — no need to ask
8. Loop back to step 1 and continue with the next issue without waiting for the user

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

