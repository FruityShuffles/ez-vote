# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Documentation

Project documentation lives in `docs/`. Before working on any issue or task, always check `docs/` for relevant files and read them. After making changes that affect architecture, schema, features, or the ballot screen, update the relevant docs.

Start at `docs/EZVote.md` — it indexes every other document.

## GitHub Issues Workflow

Use `gh` CLI (authenticated) to manage work from the GitHub issue tracker at `https://github.com/FruityShuffles/ez-vote`.

### GitHub authentication in Codex Desktop on Windows

`gh` uses a DPAPI-backed Windows keyring credential. Commands inside Codex's elevated Windows sandbox run as a dedicated sandbox user, so a sandboxed `gh` command may incorrectly report that the token is invalid even when the user's credential is valid.

- Run GitHub issue commands outside the command sandbox using the reusable, scoped `gh issue` escalation rule. Routine issue reads should not require repeated user approval once that prefix is approved.
- On any other `gh` authentication error, first rerun the read-only check `gh auth status` outside the command sandbox using a scoped escalation.
- If the escalated check succeeds, run the required `gh` command with an equally narrow reusable escalation rule.
- Do **not** run `gh auth logout`, start a new login flow, alter Credential Manager, or ask the user to reauthenticate based only on a sandboxed failure. Reauthentication is warranted only if the escalated `gh auth status` check also fails.

**Priority order**: bugs first, then enhancements.

**One issue at a time**: plan, implement, commit, and push a single issue before reading the next one. Separate issues get separate commits, so each `Fix #N:` describes exactly what changed and a bad fix reverts on its own. Batch issues into one pass only when they are genuinely entangled — the same lines, or fixing one alone would leave the code half-migrated — and say why when you do.

**Typical session** (triggered by "work on issues" or "work on issue #N"):
1. `gh issue list --label bug` first, then `gh issue list` for enhancements if no bugs remain
2. `gh issue view <N>` to read the issue body and check the `comments:` count. If that count is > 0, also run `gh issue view <N> --comments` to read the follow-up posts (the `--comments` flag prints **only** comments, not the body, and produces empty output when the count is 0).
3. Enter plan mode for non-trivial work — pause and wait for user approval before touching code
4. Implement the changes
5. Commit with the GitHub closing keyword: `Fix #N: ...`.
6. Immediately push the commit. Pushing `Fix #N: ...` to `main` auto-closes the referenced issue.
7. Loop back to step 1 and continue with the next issue without waiting for the user

**Only stop when**: plan approval is needed, you hit an ambiguity that requires a decision, or there are no more open issues.

## Build, Test & Deployment Commands

```bash
# Web app development (run from web-react/)
npm.cmd ci
npm.cmd run dev
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run build

# Production frontend release (run from a clean, current main in web-react/)
# This deploys to Cloudflare Pages project ez-vote-react, which serves ez-vote.org.
# --branch main is mandatory, or wrangler publishes a preview instead.
npx.cmd wrangler pages deploy dist --project-name ez-vote-react --branch main

# Algorithm golden tests (run from supabase/functions/)
deno task test

# Deploy edge functions (requires `supabase login` and `supabase link` first)
# --no-verify-jwt is required because the Supabase gateway rejects ES256 user JWTs;
# auth is verified inside the function itself via supabase client getUser()
supabase functions deploy compute-results --no-verify-jwt
supabase functions deploy simulate-counterfactual --no-verify-jwt

# Push database migrations
supabase db push
```

See `web-react/README.md` for the complete production-release and QA guidance.

