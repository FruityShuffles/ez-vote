# E2E tests (Playwright)

Live QA against the deployed site, in a real browser. Complements the Vitest
unit/component tests — this layer drives the actual app end to end.

## Running

```bash
# Against staging (default target — ez-vote-react.pages.dev)
npm run e2e

# Watch/debug interactively (time-travel, DOM snapshots)
npm run e2e:ui

# Open the HTML report after a run
npm run e2e:report

# Against local changes instead of staging
npm run dev            # in one terminal (Vite on :5173)
PW_BASE_URL=http://localhost:5173 npm run e2e
```

Config: `../playwright.config.ts`. Target URL comes from `PW_BASE_URL`
(defaults to staging). Chromium only for now; add Firefox/WebKit projects when
needed.

## What's covered

- `public-pages.spec.ts` — the public, no-auth surface: landing hero + CTAs,
  info-page links, SPA deep-link fallback, and the RequireAuth → /login bounce.
  Creates no data, needs no accounts; safe to run repeatedly against any target.
- `auth.spec.ts` — validates the saved-session mechanism: that user 1's stored
  session lands on the dashboard without the login UI, and that both users can be
  authenticated concurrently in isolated browser contexts.
- `election-flow.spec.ts` — the core product loop as the owner: create an
  approval election, open it, cast a ballot, close it, and confirm the
  edge-function-computed results render with the expected winner. FPTP is turned
  off so the ballot is one method; the winner is made deterministic (one voter
  approves only "Alice").
- `invite-join-flow.spec.ts` — two-user flow across separate browser contexts:
  the owner shares the join link, User 2 joins via that link and votes, both
  approve Alice, and the closed-election tally shows `Alice: 2` — proving both
  sessions' ballots were counted.

`helpers.ts` provides `createOpenApprovalElection()` and `castApprovalVote()`,
shared by the two flows above.

## Test accounts

Two throwaway accounts in the dev Supabase project, defined in `test-users.ts`
(committed in plaintext — no privileged access, fine if leaked). Two users let
tests cover multi-participant flows (one creates an election, the other joins
and votes). `helpers.ts` exports `login(page, user)` to sign in via the UI.

No cleanup is needed: elections auto-purge 60 days after creation.

## Authentication: storageState

Authed tests don't log in through the UI each time. The `setup` project
(`auth.setup.ts`) runs once before everything else (wired via
`dependencies: ['setup']` in the config), logs each user in via the UI, and
saves their session to `playwright/.auth/user{1,2}.json`. Tests then start
already-authenticated by loading those files.

So the login UI is exercised in exactly one place (setup); a transient auth blip
fails setup, not an unrelated feature test. The files are gitignored and
regenerated every run, so saved tokens never go stale.

**Use a saved session in a test:**

```ts
// Whole file/describe starts as user 1:
test.use({ storageState: TEST_USER_1.storageStateFile })

// Or, for concurrent multi-user flows, one context per user:
const ctx2 = await browser.newContext({
  storageState: TEST_USER_2.storageStateFile,
})
const user2Page = await ctx2.newPage()
// ...
await ctx2.close()
```

Tests that need the *signed-out* state (e.g. `public-pages.spec.ts`) just don't
opt in — the default has no storageState.

## Authed flows still to cover

Building on the saved sessions and the flows above: STAR and IRV ballots
(IRV ranking is drag-and-drop via `@dnd-kit` — the one tricky bit to automate),
realtime results (one context watches while another votes), edit/draft
elections, validation/error states, and settings.
