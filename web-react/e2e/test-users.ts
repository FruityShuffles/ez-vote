// Test accounts for E2E runs against the dev Supabase project.
//
// Intentionally committed in plaintext: these are throwaway accounts with no
// privileged access, used only to exercise auth-gated flows. Do NOT add any
// account here that has real data, admin rights, or matters if leaked.
//
// Two users exist so tests can cover multi-participant flows (e.g. one creates
// an election, the other joins and votes). Elections auto-purge 60 days after
// creation, so tests don't need to clean up after themselves.

export interface TestUser {
  email: string
  password: string
  /**
   * Where this user's saved session (cookies + localStorage) is written by
   * `auth.setup.ts` and read back via `test.use({ storageState })` or
   * `browser.newContext({ storageState })`. Gitignored + regenerated each run,
   * so tokens never go stale.
   */
  storageStateFile: string
}

export const TEST_USER_1: TestUser = {
  email: 'alxboxhcvbwojcecof@vtmpj.com',
  password: 'playwrighttest',
  storageStateFile: 'playwright/.auth/user1.json',
}

export const TEST_USER_2: TestUser = {
  email: 'qtcefcvuyjohwmhxhf@vtmpj.net',
  password: 'playwrighttest',
  storageStateFile: 'playwright/.auth/user2.json',
}

export const ALL_TEST_USERS: TestUser[] = [TEST_USER_1, TEST_USER_2]
