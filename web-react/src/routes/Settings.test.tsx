import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

import { Settings } from '@/routes/Settings'
import { AuthContext, type AuthContextValue } from '@/auth/context'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  deleteAccount: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('@/lib/auth', () => ({
  deleteAccount: mocks.deleteAccount,
  signOut: mocks.signOut,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'

function renderSettings(isGuest = false) {
  const auth: AuthContextValue = {
    session: isGuest ? null : ({ user: { id: 'u1' } } as Session),
    user: isGuest ? null : ({ id: 'u1' } as Session['user']),
    loading: false,
    isGuest,
    continueAsGuest: () => undefined,
  }
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.deleteAccount.mockReset().mockResolvedValue(undefined)
  mocks.signOut.mockReset().mockResolvedValue(undefined)
  vi.clearAllMocks()
})

describe('Settings', () => {
  it('links to the privacy and terms pages', () => {
    renderSettings()
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', '/privacy')
    expect(
      screen.getByRole('link', { name: 'Terms of Service' }),
    ).toHaveAttribute('href', '/tos')
  })

  it('hides the account section for a guest', () => {
    renderSettings(true)
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete Account' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
  })

  it('deletes the account, signs out, and redirects to login on confirm', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Delete Account' }))
    // Confirm dialog shows the parity wording.
    expect(screen.getByText('Delete account?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login'))
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    // signOut runs only after deletion succeeds.
    expect(mocks.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    )
  })

  it('surfaces an error toast and does not redirect when deletion fails', async () => {
    const user = userEvent.setup()
    mocks.deleteAccount.mockRejectedValue(new Error('boom'))
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Delete Account' }))
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
