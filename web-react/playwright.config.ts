import { defineConfig, devices } from '@playwright/test'

// E2E config for live QA against the deployed staging site.
//
// Target env is set via PW_BASE_URL (defaults to the staging Pages deploy).
// To QA local changes instead, run:  PW_BASE_URL=http://localhost:5173 npm run e2e
// (start `npm run dev` first — there's no webServer block because the default
// target is a remote deploy, not a local server).
//
// Backend: tests hit the existing dev Supabase project. The current suite only
// covers the public, no-auth surface, so it creates no data. Authed flows will
// need reusable test accounts + cleanup — see e2e/README.md.
export default defineConfig({
  testDir: './e2e',
  // Fail the build if test.only is committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'https://ez-vote-react.pages.dev',
    // Capture a trace on the first retry so failures are debuggable via
    // `npx playwright show-trace`. Screenshots only on failure.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Logs the test users in once and writes their storageState files.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Run setup first so saved sessions exist. No default storageState here:
      // tests start signed out (so the public-surface tests keep working), and
      // authed tests opt in with `test.use({ storageState })` or by creating a
      // context from a user's storageStateFile.
      dependencies: ['setup'],
    },
  ],
})
