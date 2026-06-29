# E2E tests (Playwright)

Assertion-based browser tests for the React app, run against the deployed
staging site.

```bash
npm run e2e          # run all specs (the setup project authenticates first)
npm run e2e:ui       # interactive UI mode (time-travel, DOM snapshots)
npm run e2e:report   # open the last HTML report
```

Setup, target env, test accounts, auth/storageState, and selector conventions
all live in the shared QA reference:
**[`../../docs/Playwright-QA-Reference.md`](../../docs/Playwright-QA-Reference.md)**.
New specs are authored via the `/e2e-test` skill, which follows those
conventions. The spec files here are self-documenting — read one (e.g.
`election-flow.spec.ts`) for the patterns.
