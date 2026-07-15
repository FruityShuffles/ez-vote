import { test, expect } from '@playwright/test'
import { createOpenApprovalElection } from './helpers'
import { TEST_USER_1, TEST_USER_2 } from './test-users'

// BAL-11: a ballot assembled against an old candidate list must not be saved.
// The voter instead receives the fresh list and must explicitly review it.
test.use({ storageState: TEST_USER_1.storageStateFile })

test('adding a candidate immediately before submit blocks and refreshes a ballot', async ({
  page: owner,
  browser,
}) => {
  const title = `E2E candidate gate ${Date.now()}`
  const electionId = await createOpenApprovalElection(owner, {
    title,
    candidates: ['Alice', 'Bob'],
    includeFptp: false,
    allowVoterCandidates: true,
  })

  const voterContext = await browser.newContext({
    storageState: TEST_USER_2.storageStateFile,
  })
  const voter = await voterContext.newPage()
  try {
    await voter.goto(`/election/${electionId}/join`)
    await expect(voter).toHaveURL(new RegExp(`/election/${electionId}$`))
    await voter.getByRole('button', { name: 'Cast Your Vote' }).click()
    await expect(voter).toHaveURL(/\/vote$/)
    await voter.getByRole('checkbox', { name: 'Alice' }).check()

    await owner.getByLabel('Add a candidate').fill('Carol')
    const addCandidate = owner.getByRole('button', { name: 'Add candidate' })
    await expect(addCandidate).toHaveCount(1)
    await addCandidate.click()
    await expect(
      owner.getByRole('heading', { name: 'Candidates (3)' }),
    ).toBeVisible()

    await voter.getByRole('button', { name: 'Submit Ballot' }).click()
    // The user-facing warning is a short-lived toast and is reviewed visually
    // in M18; the stable contract here is no persistence plus a fresh ballot.
    await expect(voter).toHaveURL(/\/vote$/)
    await expect(voter.getByRole('checkbox', { name: 'Carol' })).toBeVisible()
    await expect(
      voter.getByText('You have already submitted your ballot.'),
    ).toHaveCount(0)
  } finally {
    await voterContext.close()
  }
})
