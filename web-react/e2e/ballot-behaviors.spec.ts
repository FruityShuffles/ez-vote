import { test, expect } from '@playwright/test'
import { castApprovalVote, createOpenApprovalElection } from './helpers'
import { TEST_USER_1 } from './test-users'

test.use({ storageState: TEST_USER_1.storageStateFile })

test('a ballot counter rises after a vote and the ballot Back button returns to the election', async ({
  page,
}) => {
  const title = `E2E ballot counter ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
  })

  await expect(page.getByRole('button', { name: '0 ballots submitted' })).toBeVisible()
  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  // BAL-18: this must be a working in-app navigation affordance, not only a
  // browser-history fallback.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/election\/[0-9a-f-]+$/)

  await castApprovalVote(page, 'Alice')
  await expect(page.getByRole('button', { name: '1 ballot submitted' })).toBeVisible()
})

test('zero approval warns once, then permits the confirmation submit', async ({ page }) => {
  const title = `E2E zero approval ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
  })

  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await page.getByRole('button', { name: 'Submit Ballot' }).click()
  await expect(page.getByText("You haven't approved any candidates")).toBeVisible()
  await expect(page).toHaveURL(/\/vote$/)

  await page.getByRole('button', { name: 'Submit Ballot' }).click()
  await expect(
    page.getByText('You have already submitted your ballot.'),
  ).toBeVisible()
})

test('editing a submitted ballot marks the original selections, and undo clears them', async ({
  page,
}) => {
  const title = `E2E baseline marks ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
  })

  await castApprovalVote(page, 'Alice')
  await page.getByRole('button', { name: 'Edit Ballot' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  // Reopening the ballot untouched must look exactly like it always has (#137).
  await expect(page.locator('[data-baseline="true"]')).toHaveCount(0)
  await expect(page.getByText('Your submitted ballot')).toBeVisible()

  await page.getByRole('checkbox', { name: /^Alice/ }).click()
  await expect(
    page.getByRole('checkbox', { name: /Alice\s*\(was approved\)/ }),
  ).toHaveAttribute('data-baseline', 'true')
  await expect(page.getByText('1 change since you voted')).toBeVisible()

  await page.getByRole('button', { name: 'Undo changes' }).click()
  await expect(page.locator('[data-baseline="true"]')).toHaveCount(0)
  await expect(page.getByText('Your submitted ballot')).toBeVisible()
})

test('an unchanged realtime ballot does not issue a second compute request', async ({
  page,
}) => {
  const title = `E2E unchanged ballot ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
    realtimeResults: true,
  })

  let computeRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/compute-results')) computeRequests += 1
  })

  await castApprovalVote(page, 'Alice')
  await expect.poll(() => computeRequests, { timeout: 15_000 }).toBe(1)

  await page.getByRole('button', { name: 'Edit Ballot' }).click()
  await expect(page).toHaveURL(/\/vote$/)
  await page.getByRole('button', { name: 'Submit Ballot' }).click()
  await expect(
    page.getByText('You have already submitted your ballot.'),
  ).toBeVisible()
  // The navigation waits for the ballot upsert. Since recomputation is launched
  // immediately after that upsert, network idle is a stable negative assertion
  // point: another compute invocation would already be present in the log.
  await page.waitForLoadState('networkidle')
  expect(computeRequests).toBe(1)
})
