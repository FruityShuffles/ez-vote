import { test, expect } from '@playwright/test'
import { TEST_USER_1, TEST_USER_2 } from './test-users'

// Validates the storageState mechanism set up in auth.setup.ts. The login UI
// itself is exercised by the setup project; these tests confirm the *saved*
// sessions work — both on their own and concurrently in isolated contexts (the
// pattern multi-user flows like create → join → vote will build on).

test.describe('saved session (user 1)', () => {
  test.use({ storageState: TEST_USER_1.storageStateFile })

  test('starts already signed in, no login UI needed', async ({ page }) => {
    // Visiting a RequireAuth route directly should land, not bounce to /login.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

test('two users are authenticated concurrently in isolated contexts', async ({
  browser,
}) => {
  // Each context is an independent session loaded from a different user's saved
  // state — the foundation for concurrent multi-user flows (e.g. realtime
  // results: one user watches while the other votes).
  const ctx1 = await browser.newContext({
    storageState: TEST_USER_1.storageStateFile,
  })
  const ctx2 = await browser.newContext({
    storageState: TEST_USER_2.storageStateFile,
  })
  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()

  await page1.goto('/dashboard')
  await page2.goto('/dashboard')

  await expect(page1).toHaveURL(/\/dashboard/)
  await expect(page2).toHaveURL(/\/dashboard/)

  await ctx1.close()
  await ctx2.close()
})
