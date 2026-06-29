import { test as setup } from '@playwright/test'
import { login } from './helpers'
import { ALL_TEST_USERS } from './test-users'

// Auth setup project. Runs once before the rest of the suite (wired via
// `dependencies: ['setup']` in playwright.config.ts) and logs each test user in
// through the real UI, saving the resulting session to that user's
// storageStateFile. Other tests then start already-authenticated by pointing at
// those files — so the login UI is exercised here, in exactly one place, and a
// transient auth blip can only fail setup, not an unrelated feature test.
//
// Regenerated every run (the files are gitignored), so saved tokens never go
// stale.

for (const user of ALL_TEST_USERS) {
  setup(`authenticate ${user.email}`, async ({ page }) => {
    await login(page, user)
    await page.context().storageState({ path: user.storageStateFile })
  })
}
