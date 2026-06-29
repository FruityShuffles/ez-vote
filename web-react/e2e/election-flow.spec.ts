import { test, expect } from '@playwright/test'
import { TEST_USER_1 } from './test-users'

// Core product flow as a single signed-in user (the owner): create an election,
// open it, cast a ballot, close it, and confirm computed results render. Uses
// the simplest method — approval voting — and turns off the FPTP comparison so
// the ballot is a single set of checkboxes and results are one card.
//
// Determinism: one voter approves only "Alice", so the approval winner is Alice
// (1 approval) over Bob (0). No cleanup needed — elections auto-purge after 60
// days.

test.use({ storageState: TEST_USER_1.storageStateFile })

test('owner creates an approval election, votes, closes, and sees results', async ({
  page,
}) => {
  const title = `E2E Approval ${Date.now()}`

  // ── 1. Create & open ────────────────────────────────────────────────────────
  await page.goto('/create')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Create Election' }),
  ).toBeVisible()

  await page.getByLabel('Election Title').fill(title)
  // `exact` so these don't also match the "Move candidate 1 up/down" buttons.
  await page.getByLabel('Candidate 1', { exact: true }).fill('Alice')
  await page.getByLabel('Candidate 2', { exact: true }).fill('Bob')
  // Approval stays checked by default; drop FPTP to keep this to one method.
  await page.getByRole('switch', { name: 'Include FPTP comparison' }).click()
  await page.getByRole('button', { name: 'Save & Open' }).click()

  // Lands on the new election's detail page (status: open).
  await expect(page).toHaveURL(/\/election\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

  // ── 2. Cast a ballot ────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  await page.getByRole('checkbox', { name: 'Alice' }).check()
  await page.getByRole('button', { name: 'Submit Ballot' }).click()

  // Back on the detail page with the ballot recorded.
  await expect(page).toHaveURL(/\/election\/[0-9a-f-]+$/)
  await expect(
    page.getByText('You have already submitted your ballot.'),
  ).toBeVisible()

  // ── 3. Close & compute results ──────────────────────────────────────────────
  await page.getByRole('button', { name: 'Close & Compute Results' }).click()

  // Results are computed by the edge function on close — allow time for it.
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({
    timeout: 20_000,
  })
  // `exact` to hit the result card's title, not the analysis headline/summary.
  await expect(page.getByText('Approval Voting', { exact: true })).toBeVisible()
  await expect(page.getByText('Winner: Alice')).toBeVisible({ timeout: 20_000 })
})
