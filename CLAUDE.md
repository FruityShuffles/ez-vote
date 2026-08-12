# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Project documentation lives in `docs/`. Before working on any issue or task, always check `docs/` for relevant files and read them. After making changes that affect architecture, schema, features, or the ballot screen, update the relevant docs.

Start at `docs/EZVote.md` — it indexes every other document.

## GitHub Issues Workflow

Use `gh` CLI (authenticated) to manage work from the GitHub issue tracker at `https://github.com/FruityShuffles/ez-vote`.

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

## Testing & QA

The app (`web-react/`) has two browser-based QA workflows against the
deployed site (`ez-vote-react.pages.dev`), each with a skill:

- **`/e2e-test`** — automated, assertion-based Playwright specs (`npm run e2e`
  from `web-react/`).
- **`/ux-review`** — interactive heuristic UX review via the Playwright MCP
  browser (configured in `.mcp.json`; loads at startup, so restart after
  changes).

Shared setup and conventions for both: `docs/Playwright-QA-Reference.md`.

## Build & Development Commands

Use `npm.cmd` / `npx.cmd` in this Windows PowerShell workspace; plain `npm` / `npx` elsewhere.

```bash
# Web app — run from web-react/
npm.cmd ci
npm.cmd run dev          # Vite dev server
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run     # Vitest
npm.cmd run build        # tsc -b && vite build → dist/

# Production release (from a clean, current main in web-react/)
# Deploys to the ez-vote-react Cloudflare Pages project, which serves ez-vote.org.
# --branch main is mandatory, or wrangler publishes a preview instead.
npx.cmd wrangler pages deploy dist --project-name ez-vote-react --branch main

# Algorithm golden tests — run from supabase/functions/
deno task test

# Service-role scripts (seed-case-studies, export-fixtures). NEVER paste the
# service-role key on a command line or into .env — dot-source the helper, which
# reads it from Windows Credential Manager. docs/Backend/Service-Role Scripts.md
. .\tools\Set-SupabaseEnv.ps1        # then, from supabase/functions/:
deno task seed-case-studies -- --dry-run

# Deploy edge functions (requires `supabase login` and `supabase link` first)
# --no-verify-jwt is required because the Supabase gateway rejects ES256 user JWTs;
# auth is verified inside the function itself via supabase client getUser()
supabase functions deploy compute-results --no-verify-jwt
supabase functions deploy simulate-counterfactual --no-verify-jwt

# Push database migrations
supabase db push
```

Full release procedure and configuration steps: `web-react/README.md` and
`docs/Migration/Cutover Plan.md` Appendix A.

