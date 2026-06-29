---
name: e2e-test
description: >-
  Write and run an automated, assertion-based Playwright end-to-end test for a
  feature or flow in the EZVote React app (web-react/), driving a real browser
  against the deployed staging site. Use this whenever the user wants regression
  coverage or a browser test that proves behavior is correct — e.g. "write an
  e2e test for the settings page", "add a Playwright test for the invite flow",
  "test that closing an election shows results", "cover the STAR ballot",
  "make sure signup still works end to end". Use this (not ux-review) when the
  goal is a pass/fail spec, not a design critique.
---

# E2E test (Playwright)

Write a Playwright spec that drives the real app and asserts correct behavior,
following this repo's conventions. The deliverable is a committed `.spec.ts` in
`web-react/e2e/` that passes against staging.

## Before writing

1. **Read the shared setup reference**: `docs/Playwright-QA-Reference.md` (target
   env, test accounts, auth/storageState, selector conventions, helpers,
   determinism, commands). Then read an existing spec under `web-react/e2e/`
   (e.g. `election-flow.spec.ts`) to match style.
2. **Nail down the oracle.** A test is only as good as its definition of
   "correct." If the user hasn't said what *should* be true after the actions
   (the assertions), ask — that's the one thing you can't infer reliably. Restate
   it back as concrete expected outcomes before coding.
3. **Inspect the real UI** for accurate selectors. Read the relevant
   components/routes under `web-react/src/` rather than guessing labels — roles
   and accessible names must match what renders.

## Writing the spec

- **Entry & auth:** decide if the flow is public or behind `RequireAuth`. For
  authed flows, opt into a saved session with
  `test.use({ storageState: TEST_USER_1.storageStateFile })`; for concurrent
  multi-user flows, give each user their own `browser.newContext({ storageState })`
  (see `invite-join-flow.spec.ts`).
- **Reuse helpers** from `web-react/e2e/helpers.ts`
  (`createOpenApprovalElection`, `castApprovalVote`, `login`). If a multi-step
  setup recurs, extract a new helper there instead of duplicating it.
- **Selectors:** target by role/label/text (the accessibility tree), never CSS
  classes. Remember the base-ui gotcha — switches/checkboxes need
  `getByRole('switch'|'checkbox', { name })`, and candidate inputs need
  `getByLabel('Candidate N', { exact: true })`. See the reference for why.
- **Determinism:** unique titles (`${Date.now()}`), ballots with a clear winner,
  and generous timeouts (~20s) on results that wait for the `compute-results`
  edge function. No cleanup needed (60-day auto-purge).
- Place the file at `web-react/e2e/<feature>.spec.ts`.

## Running & finishing

1. Run just your spec while iterating: `cd web-react && npx playwright test
   <feature>.spec.ts`. The `setup` project runs first automatically.
2. When a locator is ambiguous or an assertion fails, read the error (Playwright
   prints the conflicting elements and a screenshot path) and fix the locator or
   the expectation — don't add `waitForTimeout` sleeps; rely on auto-waiting and
   web-first assertions (`await expect(...)`).
3. Once green, run the full suite (`npx playwright test`) to confirm no
   regressions, then report the result. Mention the file added and the pass
   count. Commit only if the user asks.
