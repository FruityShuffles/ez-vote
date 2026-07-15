import { test, expect } from '@playwright/test'
import {
  castApprovalVote,
  createOpenApprovalElection,
} from './helpers'
import { TEST_USER_1, TEST_USER_2 } from './test-users'

test.use({ storageState: TEST_USER_1.storageStateFile })

test('public ballots expose read-only participant ballots with paging, and stay gated when off', async ({
  page: owner,
  browser,
}) => {
  const title = `E2E public ballots ${Date.now()}`
  const electionId = await createOpenApprovalElection(owner, {
    title,
    candidates: ['Alice', 'Bob'],
    publicBallots: true,
  })

  // The setup project regenerates this session for the active base URL before
  // this test runs, so the second participant starts authenticated on either
  // staging or localhost.
  const voterContext = await browser.newContext({
    storageState: TEST_USER_2.storageStateFile,
  })
  const voter = await voterContext.newPage()
  try {
    await voter.goto(`/election/${electionId}/join`)
    await expect(voter).toHaveURL(new RegExp(`/election/${electionId}$`))
    await castApprovalVote(voter, 'Bob')
    await castApprovalVote(owner, 'Alice')

    await expect(
      owner.getByRole('button', { name: '2 ballots submitted' }),
    ).toBeVisible()
    await owner.getByRole('button', { name: '2 ballots submitted' }).click()
    await expect(owner.getByRole('button', { name: 'View ballot' })).toHaveCount(2)
    await owner.getByRole('button', { name: 'View ballot' }).first().click()
    await expect(owner).toHaveURL(new RegExp(`/election/${electionId}/ballot/0$`))
    await expect(owner.getByText('1 of 2')).toBeVisible()
    await expect(owner.getByRole('checkbox', { name: 'Alice' })).toBeDisabled()
    await owner.getByRole('button', { name: 'Next' }).click()
    await expect(owner).toHaveURL(new RegExp(`/election/${electionId}/ballot/1$`))
    await expect(owner.getByText('2 of 2')).toBeVisible()
    await expect(owner.getByRole('button', { name: 'Previous' })).toBeEnabled()

    // The server RPC applies the same gate to the owner; a guessed view URL for
    // an election which did not opt in must not reveal a ballot.
    const privateId = await createOpenApprovalElection(owner, {
      title: `E2E private ballots ${Date.now()}`,
      candidates: ['Cora', 'Dan'],
    })
    await castApprovalVote(owner, 'Cora')
    await owner.goto(`/election/${privateId}/ballot/0`)
    await expect(owner.getByRole('alert')).toHaveText(
      'Could not load this public ballot.',
    )
  } finally {
    await voterContext.close()
  }
})
