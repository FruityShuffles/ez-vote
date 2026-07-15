# Playwright QA Reference (shared setup)

Single source of truth for the **setup and conventions** shared by both QA
workflows in this repo:

- **`/e2e-test`** — automated, assertion-based Playwright specs (regression
  safety). Run them with `npm run e2e` from `web-react/` (see
  `web-react/e2e/README.md`).
- **`/ux-review`** — interactive heuristic UX review via the Playwright MCP
  browser.

Both skills read this file for setup; the step-by-step procedures live in the
skills themselves. Keep shared facts here so they don't drift across the
workflows.

## Target environment

- Default target is **production**: `https://ez-vote.org`.
- `https://next.ez-vote.org` and `https://ez-vote-react.pages.dev` are aliases of the
  same production Pages deployment, not isolated staging environments.
- E2E reads the base URL from `PW_BASE_URL` (defaults to production). To run against
  local dev instead: `cd web-react && npm.cmd run dev`, then
  `PW_BASE_URL=http://localhost:5173 npm.cmd run e2e`.
- A Wrangler deploy reaches production only with `--branch main`; QA the deployed commit,
  not a preview upload.

## Test accounts

Two throwaway accounts (no privileged access) in the production Supabase project, defined
in `web-react/e2e/test-users.ts`: `TEST_USER_1`, `TEST_USER_2`, and
`ALL_TEST_USERS`. Two users enable multi-participant flows (one creates/invites,
the other joins/votes). Tests write only throwaway-account data to production; do not use
them to inspect, alter, or delete real-user data. Elections auto-purge 60 days after
creation, so the test elections need no manual cleanup.

## Authentication

- **E2E:** the `setup` project (`web-react/e2e/auth.setup.ts`) logs both users in
  once and saves sessions to `web-react/playwright/.auth/user{1,2}.json`
  (gitignored, regenerated each run). Opt into a session per test/file with
  `test.use({ storageState: TEST_USER_1.storageStateFile })`, or, for concurrent
  multi-user flows, one context per user via
  `browser.newContext({ storageState: ... })`. The login UI itself is exercised
  only in setup.
- **UX review (MCP):** either log in once in the persistent MCP browser profile
  (it persists across runs), or start the MCP server with `--storage-state`
  pointed at a saved session.

## Selector conventions (important)

This UI uses **base-ui** components, which render **two** accessibility nodes per
control — the real ARIA element *and* a hidden `<input>`. So `getByLabel(...)` is
ambiguous for switches and checkboxes. Target by **role** instead:

- Switch: `getByRole('switch', { name: 'Include FPTP comparison' })`
- Checkbox: `getByRole('checkbox', { name: 'Alice' })`

Also: candidate name inputs use `aria-label="Candidate N"`, which collides under
substring matching with the "Move candidate N up/down" buttons — use
`getByLabel('Candidate 1', { exact: true })`.

Prefer role/label/text locators (the accessibility tree) over CSS classes, so
tests survive restyling and assert what users actually perceive.

## Shared helpers

`web-react/e2e/helpers.ts` provides reusable flow steps — reuse these and add to
them rather than re-deriving flows:

- `login(page, user)` — sign in via the UI (used by setup).
- `createOpenApprovalElection(page, { title, candidates })` — create + open an
  approval election (FPTP off for a single-method ballot); returns the new id.
- `castApprovalVote(page, candidateName)` — approve one candidate and submit.

When a new multi-step flow recurs across specs, extract it into a helper here.

## Determinism

Make outcomes deterministic so assertions are stable: unique titles
(`` `E2E ... ${Date.now()}` ``), and ballots that produce a clear winner (e.g. a
single voter approving only "Alice" → winner Alice; two voters approving Alice →
`Alice: 2`). Results are computed by the `compute-results` edge function on close,
so give result assertions a generous timeout (~20s) rather than asserting
instantly.

## Commands & install

From `web-react/`:

- `npm run e2e` — run all specs (setup project runs first via `dependencies`).
- `npm run e2e:ui` — interactive UI mode (time-travel, snapshots).
- `npm run e2e:report` — open the last HTML report.
- First-time browser binary: `npx playwright install chromium`.

## Playwright MCP (UX review)

Configured in `.mcp.json` at the repo root:
`cmd /c npx -y @playwright/mcp@latest --caps vision` (the `cmd /c` wrapper is
required on Windows; `--caps vision` enables coordinate-based mouse control for
drag-and-drop ballots like IRV ranking). MCP servers load at Claude Code startup,
so after changing `.mcp.json` you must **restart/reconnect** and approve the
server on first use. On-disk MCP output goes to `.playwright-mcp/` (gitignored).
