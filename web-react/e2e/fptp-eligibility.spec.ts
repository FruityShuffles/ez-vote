import { test, expect } from '@playwright/test'
import { createOpenApprovalElection } from './helpers'
import { TEST_USER_1 } from './test-users'

// BAL-06: FPTP is one consistent ballot choice. On an Approval ballot, only
// candidates the voter approved may be the FPTP first choice.
test.use({ storageState: TEST_USER_1.storageStateFile })

test('Approval + FPTP restricts first choice to approved candidates', async ({
  page,
}) => {
  const title = `E2E FPTP eligibility ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
    includeFptp: true,
  })

  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  await page.getByRole('checkbox', { name: 'Alice' }).check()
  await expect(page.getByText('Your first choice: Alice')).toBeVisible()
  await expect(page.getByText('Your first choice: Bob')).toHaveCount(0)

  // When both candidates are approved, both â€” and only both â€” become choices.
  await page.getByRole('checkbox', { name: 'Bob' }).check()
  await expect(page.getByRole('radio', { name: 'Alice' })).toHaveCount(1)
  await expect(page.getByRole('radio', { name: 'Bob' })).toHaveCount(1)
})

test('STAR + FPTP restricts first choice to top-scored candidates', async ({
  page,
}) => {
  const title = `E2E STAR FPTP eligibility ${Date.now()}`
  await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
    algorithms: ['star'],
    includeFptp: true,
  })

  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  const aliceScores = page.getByRole('radiogroup', { name: 'Score for Alice' })
  const bobScores = page.getByRole('radiogroup', { name: 'Score for Bob' })
  await aliceScores.getByRole('radio', { name: '5' }).click()
  await bobScores.getByRole('radio', { name: '4' }).click()

  await expect(page.getByText('Your first choice: Alice')).toBeVisible()
  await expect(page.getByText('Your first choice: Bob')).toHaveCount(0)

  await bobScores.getByRole('radio', { name: '5' }).click()
  await expect(page.getByRole('radio', { name: 'Alice' })).toHaveCount(1)
  await expect(page.getByRole('radio', { name: 'Bob' })).toHaveCount(1)
})
