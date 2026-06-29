import { test, expect } from '@playwright/test'

// Smoke suite for the public, no-auth surface. These need no test accounts and
// create no data, so they're safe to run against staging or the dev Supabase
// project repeatedly. Authed flows (dashboard, create election, ballot) live in
// a separate suite once reusable test accounts exist — see README.md.

test('landing page renders the hero and signed-out CTAs', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'EZVote' }),
  ).toBeVisible()
  // Signed-out CTAs (the Home component swaps these for "Go to Dashboard" when
  // authed — see routes/Home.tsx).
  await expect(page.getByRole('link', { name: 'Get Started' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
})

test('landing links reach the info pages', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Learn about voting methods' }).click()
  await expect(page).toHaveURL(/\/learn$/)
})

test('direct navigation to public routes works (SPA deep links)', async ({
  page,
}) => {
  // Exercises the Cloudflare Pages _redirects SPA fallback for deep links.
  for (const path of ['/learn', '/privacy', '/tos']) {
    const res = await page.goto(path)
    expect(res?.status(), `${path} should not 404`).toBeLessThan(400)
  }
})

test('protected route bounces a signed-out visitor to login', async ({
  page,
}) => {
  // RequireAuth threads redirect=<here> through to /login (see auth/guards).
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/)
})
