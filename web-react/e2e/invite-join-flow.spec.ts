import { test, expect } from '@playwright/test'
import { castApprovalVote, createOpenApprovalElection } from './helpers'
import { TEST_USER_1, TEST_USER_2 } from './test-users'

// Two-user invite → join flow, the payoff of having two accounts + storageState.
// User 1 (owner) creates and opens an election and shares the join link; User 2,
// in a fully separate browser context, joins via that link and votes. Both then
// approve Alice, so when the owner closes the election the computed approval
// tally is Alice: 2 — proving both users' ballots were counted across the two
// sessions.
//
// `page` is User 1 (the owner) via the default storageState below; User 2 is a
// second context created from their own saved session.

test.use({ storageState: TEST_USER_1.storageStateFile })

test('owner invites, second user joins via link and votes, results count both', async ({
  page,
  browser,
}) => {
  const title = `E2E Invite ${Date.now()}`

  // ── User 1: create, open, and share the join link ───────────────────────────
  const electionId = await createOpenApprovalElection(page, {
    title,
    candidates: ['Alice', 'Bob'],
  })

  // The invite affordance copies the join link to the clipboard, so the owner
  // context needs clipboard permission for the success path.
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.getByRole('button', { name: 'Invite Voters' }).click()
  await page.getByRole('button', { name: 'Copy Join Link' }).click()
  await expect(page.getByText('Join link copied!')).toBeVisible()
  await page.keyboard.press('Escape') // close the invite dialog

  // ── User 2: join via the link in an isolated context, then vote ─────────────
  const ctx2 = await browser.newContext({
    storageState: TEST_USER_2.storageStateFile,
  })
  const user2 = await ctx2.newPage()
  try {
    // The join screen fires join_election on mount and forwards to the detail
    // page — landing there (an authed, member-only route) confirms the join.
    await user2.goto(`/election/${electionId}/join`)
    await expect(user2).toHaveURL(new RegExp(`/election/${electionId}$`))
    await expect(
      user2.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible()

    await castApprovalVote(user2, 'Alice')

    // ── User 1: also vote, then close and verify both ballots are tallied ─────
    await castApprovalVote(page, 'Alice')

    await page.getByRole('button', { name: 'Close & Compute Results' }).click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Winner: Alice')).toBeVisible({
      timeout: 20_000,
    })
    // Both users approved Alice across two sessions.
    await expect(page.getByText('Alice: 2')).toBeVisible()
  } finally {
    await ctx2.close()
  }
})
