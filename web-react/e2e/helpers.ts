import { expect, type Page } from '@playwright/test'
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
