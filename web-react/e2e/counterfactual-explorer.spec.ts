import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { loadEnv } from 'vite'

import { createOpenApprovalElection } from './helpers'
import { TEST_USER_1, TEST_USER_2 } from './test-users'

test.use({ storageState: TEST_USER_1.storageStateFile })

async function castScoreRankBallot(
  page: Page,
  scores: Record<string, number>,
  approvals: number,
) {
  await page.getByRole('button', { name: 'Cast Your Vote' }).click()
  await expect(page).toHaveURL(/\/vote$/)

  for (const [candidate, score] of Object.entries(scores)) {
    await page
      .getByRole('radiogroup', { name: `Score for ${candidate}` })
      .getByRole('radio', { name: String(score) })
      .click()
  }
  for (let index = 0; index < approvals; index++) {
    await page
      .getByRole('button', { name: 'Increase number to approve' })
      .click()
  }

  await page.getByRole('button', { name: 'Submit Ballot' }).click()
  await expect(
    page.getByText('You have already submitted your ballot.'),
  ).toBeVisible()
}

function databaseClient() {
  const env = loadEnv('', process.cwd(), 'VITE_')
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE Supabase variables for the no-write oracle')
  }
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function storedState(
  db: ReturnType<typeof databaseClient>,
  electionId: string,
) {
  const [results, ballots] = await Promise.all([
    db
      .from('results')
      .select('algorithm,result_data')
      .eq('election_id', electionId)
      .order('algorithm'),
    db.rpc('get_public_ballots', { p_election_id: electionId }),
  ])
  if (results.error) throw results.error
  if (ballots.error) throw ballots.error
  return {
    results: results.data,
    ballots: (ballots.data ?? [])
      .map(
        (ballot: {
          voter_id: string | null
          display_name: string | null
          payload: unknown
        }) => ({
          voter_id: ballot.voter_id,
          display_name: ballot.display_name,
          payload: ballot.payload,
        }),
      )
      .sort((a, b) => (a.voter_id ?? '').localeCompare(b.voter_id ?? '')),
  }
}

test('a hypothetical ranking edit flips only IRV, undo restores baseline, and nothing is written', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const title = `E2E what-if ${Date.now()}`
  const electionId = await createOpenApprovalElection(page, {
    title,
    candidates: ['Ada', 'Bo', 'Cy'],
    algorithms: ['approval', 'irv', 'star'],
    includeFptp: false,
    publicBallots: true,
  })

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Invite Voters' }).click()
  await page.getByRole('button', { name: 'Copy Join Link' }).click()
  await expect(page.getByText('Join link copied!')).toBeVisible()
  await page.keyboard.press('Escape')

  const context2 = await browser.newContext({
    storageState: TEST_USER_2.storageStateFile,
  })
  const user2 = await context2.newPage()
  const db = databaseClient()
  try {
    await user2.goto(`/election/${electionId}/join`)
    await expect(user2).toHaveURL(new RegExp(`/election/${electionId}$`))

    // Owner: Cy 5, Ada 4; both are approved. Raising Ada into a tie later
    // changes the derived IRV order while leaving the approval set intact.
    await castScoreRankBallot(page, { Ada: 4, Cy: 5 }, 2)
    // Second voter: Bo 5, Cy 4. Cy remains the STAR winner across the edit.
    await castScoreRankBallot(user2, { Bo: 5, Cy: 4 }, 1)

    await page.getByRole('button', { name: 'Close & Compute Results' }).click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByRole('button', { name: 'Explore what-ifs' }),
    ).toBeVisible()

    const auth = await db.auth.signInWithPassword({
      email: TEST_USER_1.email,
      password: TEST_USER_1.password,
    })
    if (auth.error || !auth.data.user) {
      throw auth.error ?? new Error('Could not authenticate no-write oracle')
    }
    const before = await storedState(db, electionId)
    const ownerBallot = before.ballots.find(
      (ballot) => ballot.voter_id === auth.data.user.id,
    )
    const otherBallot = before.ballots.find(
      (ballot) => ballot.voter_id !== auth.data.user.id,
    )
    if (!ownerBallot || !otherBallot) {
      throw new Error('Expected both E2E ballots in the public ballot RPC')
    }
    const ownerName = ownerBallot.display_name || 'Unnamed voter'
    const otherName = otherBallot.display_name || 'Unnamed voter'

    await page.getByRole('button', { name: 'Explore what-ifs' }).click()
    await expect(page).toHaveURL(`/election/${electionId}/explore`)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // Keyboard-only pass through the picker: filter to the owner ballot by its
    // current top choice, then open it.
    const cyFilter = page
      .getByRole('group', { name: 'Show ballots whose top choice was' })
      .getByRole('button', { name: 'Cy,' })
    await cyFilter.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: ownerName })).toBeVisible()
    await expect(
      page.getByRole('button', { name: otherName }),
    ).not.toBeVisible()
    await page.getByRole('button', { name: ownerName }).focus()
    await page.keyboard.press('Enter')

    // Raise Ada into a 5–5 tie. Candidate-order tie-breaking moves Ada ahead
    // of Cy for IRV, while STAR still elects Cy and approvals do not change.
    // The editor interaction is keyboard-only as well.
    const adaFive = page
      .getByRole('radiogroup', { name: 'Score for Ada' })
      .getByRole('radio', { name: '5' })
    await adaFive.focus()
    await page.keyboard.press('Space')

    // The baseline marks (#137): the chip Ada was actually given keeps a dotted
    // outline, and that is the ONLY mark — Ada overtaking Cy in the list is a
    // consequence of the score, so no position ghost appears with it.
    await expect(
      page
        .getByRole('radiogroup', { name: 'Score for Ada' })
        .getByRole('radio', { name: '4, your original score' }),
    ).toHaveAttribute('data-baseline', 'true')
    await expect(page.locator('[data-baseline="true"]')).toHaveCount(1)
    await expect(page.getByText('1 change to their ballot')).toBeVisible()

    const rail = page.getByRole('region', {
      name: 'Effect on each voting method',
    })
    const irvStrip = rail.locator('[data-algorithm="irv"]')
    await expect(irvStrip).toHaveAttribute('data-changed', 'true', {
      timeout: 20_000,
    })
    expect(
      await irvStrip.evaluate(
        (element) => getComputedStyle(element).transitionProperty,
      ),
    ).toBe('none')
    await expect(rail.locator('[data-algorithm="approval"]')).toHaveAttribute(
      'data-changed',
      'false',
    )
    await expect(rail.locator('[data-algorithm="star"]')).toHaveAttribute(
      'data-changed',
      'false',
    )

    // Undo from the ledger and wait for the baseline simulation to return.
    const undo = page.getByRole('button', {
      name: `Undo the change to ${ownerName}'s ballot`,
    })
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/election/${electionId}/explore`)
    // The rail heading, not getByText('The real result') — that text is a
    // substring of the always-present "The real results are unchanged."
    // subtitle, which let an undo that silently failed slip through (#136).
    await expect(
      page.getByRole('heading', { name: 'The real result' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset all' })).toBeHidden()
    await expect(
      page.getByRole('status', { name: 'Updating results' }),
    ).toBeHidden({ timeout: 20_000 })

    // The flip search (#135): user-initiated, honest about k = 1 minimality,
    // and applying an answer routes it through the normal simulate path.
    const flipPanel = page.getByRole('region', { name: 'Flip the outcome' })
    await expect(flipPanel).toBeVisible()
    await flipPanel.getByRole('button', { name: 'Run the search' }).click()
    await expect(flipPanel.getByText(/^As voted, /)).toBeVisible({
      timeout: 20_000,
    })
    // Two ballots, three candidates: a single-ballot promotion always flips
    // some non-winner, and k = 1 is the one provably minimal case.
    await expect(
      flipPanel.getByText(/Change 1 ballot and .+ the smallest possible change\./),
    ).toBeVisible()

    await flipPanel
      .getByRole('button', { name: 'Try these changes' })
      .first()
      .click()
    await expect(flipPanel.getByText(/^Applied —/)).toBeVisible()
    await expect(irvStrip).toHaveAttribute('data-changed', 'true', {
      timeout: 20_000,
    })

    // Clear the applied suggestion and let the baseline simulation settle.
    await page.getByRole('button', { name: 'Reset all' }).click()
    await expect(
      page.getByRole('status', { name: 'Updating results' }),
    ).toBeHidden({ timeout: 20_000 })

    // The endpoint has no write credential: prove both persisted surfaces are
    // byte-for-structure identical after simulation, undo, and the flip search.
    const after = await storedState(db, electionId)
    expect(after.results).toEqual(before.results)
    expect(after.ballots).toEqual(before.ballots)
  } finally {
    await db.auth.signOut({ scope: 'local' })
    await context2.close()
  }
})
