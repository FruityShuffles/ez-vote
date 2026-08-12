import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, GUEST_STORAGE_KEY } from '@/auth/AuthProvider'
import { useAuth } from '@/auth/context'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: undefined as
    | ((event: string, session: Session | null) => void)
    | undefined,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (
        listener: (event: string, session: Session | null) => void,
      ) => {
        mocks.listener = listener
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
      },
    },
  },
}))

function AuthProbe() {
  const { user, loading, isGuest, continueAsGuest } = useAuth()
  return (
    <>
      <span>{loading ? 'loading' : 'ready'}</span>
      <span>{isGuest ? 'guest' : 'not guest'}</span>
      <span>{user?.id ?? 'no user'}</span>
      <button type="button" onClick={continueAsGuest}>
        Continue
      </button>
    </>
  )
}

function renderProvider() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.listener = undefined
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: null },
    error: null,
  })
  mocks.unsubscribe.mockClear()
})

describe('AuthProvider guest state', () => {
  it('persists guest mode across provider remounts', async () => {
    const user = userEvent.setup()
    const first = renderProvider()
    await screen.findByText('ready')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('guest')).toBeInTheDocument()
    expect(window.localStorage.getItem(GUEST_STORAGE_KEY)).toBe('true')

    first.unmount()
    renderProvider()
    await screen.findByText('ready')
    expect(screen.getByText('guest')).toBeInTheDocument()
  })

  it('clears guest mode when a real session appears', async () => {
    const user = userEvent.setup()
    renderProvider()
    await screen.findByText('ready')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const session = { user: { id: 'account-1' } } as Session
    act(() => mocks.listener?.('SIGNED_IN', session))

    await waitFor(() =>
      expect(screen.getByText('not guest')).toBeInTheDocument(),
    )
    expect(screen.getByText('account-1')).toBeInTheDocument()
    expect(window.localStorage.getItem(GUEST_STORAGE_KEY)).toBeNull()
  })
})
