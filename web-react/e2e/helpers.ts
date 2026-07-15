import { expect, type Page } from '@playwright/test'
import type { VotingAlgorithm } from '@/lib/elections'
import type { TestUser } from './test-users'

// Sign in through the real login UI and wait for the post-auth redirect.
// On success the Login screen doesn't navigate itself — RedirectIfAuthed reacts
// to the session change (AUTH-01) — so we wait for the URL to leave /login.
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

// Create an approval-only election and open it, returning the new election id.
// FPTP is turned off so the ballot is a single set of checkboxes. The acting
// page must already be signed in. Note base-ui renders both a real ARIA control
// and a hidden input for switches/checkboxes, so we target them by role.
export async function createOpenApprovalElection(
  page: Page,
  opts: {
    title: string
    candidates: [string, string]
    includeFptp?: boolean
    algorithms?: VotingAlgorithm[]
    allowVoterCandidates?: boolean
    realtimeResults?: boolean
    publicBallots?: boolean
  },
): Promise<string> {
  await page.goto('/create')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Create Election' }),
  ).toBeVisible()

  await page.getByLabel('Election Title').fill(opts.title)
  // `exact` so these don't also match the "Move candidate N up/down" buttons.
  await page.getByLabel('Candidate 1', { exact: true }).fill(opts.candidates[0])
  await page.getByLabel('Candidate 2', { exact: true }).fill(opts.candidates[1])

  const algorithms = opts.algorithms ?? ['approval']
  const algorithmLabels: Record<VotingAlgorithm, string> = {
    approval: 'Approval Voting',
    irv: 'Instant Runoff Voting (IRV)',
    star: 'STAR Voting',
  }
  for (const algorithm of ['approval', 'irv', 'star'] as VotingAlgorithm[]) {
    const checkbox = page.getByRole('checkbox', {
      name: algorithmLabels[algorithm],
    })
    if (algorithms.includes(algorithm) !== (algorithm === 'approval')) {
      await checkbox.click()
    }
  }

  if (!opts.includeFptp) {
    await page
      .getByRole('switch', { name: 'Include FPTP comparison' })
      .click()
  }
  if (opts.allowVoterCandidates) {
    await page
      .getByRole('switch', { name: 'Allow voters to add candidates' })
      .click()
  }
  if (opts.realtimeResults) {
    await page.getByRole('switch', { name: 'Show real-time results' }).click()
  }
  if (opts.publicBallots) {
    await page.getByRole('switch', { name: 'Public ballots' }).click()
  }
  await page.getByRole('button', { name: 'Save & Open' }).click()

  await expect(page).toHaveURL(/\/election\/[0-9a-f-]+$/)
  const id = page.url().match(/\/election\/([0-9a-f-]+)/)?.[1]
  if (!id) throw new Error(`Could not parse election id from ${page.url()}`)
  return id
}

// From an open election's detail page, cast an approval ballot for one candidate
// and return to the detail page with the ballot recorded.
export async function castApprovalVote(
  page: Page,
  candidateName: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)
  await page.getByRole('checkbox', { name: candidateName }).check()
  await page.getByRole('button', { name: 'Submit Ballot' }).click()
  await expect(
    page.getByText('You have already submitted your ballot.'),
  ).toBeVisible()
}
