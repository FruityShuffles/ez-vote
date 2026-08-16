import { expect, test } from '@playwright/test'

test('a guest explores a Case Study and reaches account creation from the locked dashboard', async ({
  page,
}) => {
  test.setTimeout(90_000)

  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as guest' }).click()

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  await expect(page.getByRole('tab', { name: 'Case Studies' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: 'New Election' })).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Create account' }),
  ).toBeVisible()

  await page
    .getByRole('link', {
      name: 'When ranking a candidate higher makes them lose',
    })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'When ranking a candidate higher makes them lose',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Explore what-ifs' }).click()
  await expect(
    page.getByRole('heading', { name: 'Explore what-ifs' }),
  ).toBeVisible()

  // Since #146 the flip search is precomputed at election close and stored in
  // `flip_searches`; the seed script writes that row for every IRV-tabulated
  // case study, so a guest gets the answer on first render — no button, no
  // wait. The live `simulate-counterfactual` search is the fallback path for
  // elections closed before #146 and is not exercised here. The answer is then
  // applied through the normal hypothetical-edit path.
  const flipPanel = page.getByRole('region', { name: 'Flip the outcome' })
  await expect(flipPanel.getByText(/^As voted, /)).toBeVisible()
  await expect(
    flipPanel.getByRole('button', { name: 'Run the search' }),
  ).toBeHidden()
  await flipPanel
    .getByRole('button', { name: 'Try these changes' })
    .first()
    .click()
  await expect(flipPanel.getByText(/^Applied —/)).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Your changes' }),
  ).toContainText(/ballot changed/)

  await page.getByRole('link', { name: 'Case Studies' }).click()
  await page.getByRole('tab', { name: 'My Elections' }).click()

  const locked = page.getByRole('region', {
    name: 'My Elections requires an account',
  })
  await expect(
    locked.getByRole('heading', {
      name: 'Create an account for your elections',
    }),
  ).toBeVisible()
  await locked.getByRole('link', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/signup')
  await expect(
    page.getByRole('heading', { name: 'Create account' }),
  ).toBeVisible()
})
