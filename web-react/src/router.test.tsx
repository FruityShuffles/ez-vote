import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/auth/context'
import { routes } from '@/router'

beforeAll(() => vi.stubGlobal('scrollTo', vi.fn()))

const LOGGED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
}
const LOADING: AuthContextValue = { session: null, user: null, loading: true }
const LOGGED_IN: AuthContextValue = {
  session: { user: { id: 'u1' } } as Session,
  user: { id: 'u1' } as Session['user'],
  loading: false,
}

function renderRoute(path: string, auth: AuthContextValue) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return router
}

describe('nested application routes', () => {
  it('renders one authenticated app shell around protected content', async () => {
    renderRoute('/settings', LOGGED_IN)

    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('banner').firstElementChild).toHaveClass(
      'max-w-6xl',
    )
    expect(screen.getByRole('main').firstElementChild).toHaveClass('max-w-4xl')
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'New Election' }),
    ).not.toBeInTheDocument()
  })

  it('does not flash the authenticated app bar while auth is loading', () => {
    renderRoute('/settings', LOADING)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'EZVote home' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument()
  })

  it('threads an invite deep link through the real nested auth route', async () => {
    const router = renderRoute('/election/invite-1/join', LOGGED_OUT)

    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe('/login?redirect=%2Felection%2Finvite-1%2Fjoin'),
    )
    expect(
      await screen.findByRole('link', { name: 'Sign up' }),
    ).toHaveAttribute('href', '/signup?redirect=%2Felection%2Finvite-1%2Fjoin')
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('moves focus on pathname changes but not query-only changes', async () => {
    const user = userEvent.setup()
    const router = renderRoute('/settings', LOGGED_IN)
    const privacy = await screen.findByRole('link', { name: 'Privacy Policy' })

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
    await user.click(privacy)
    expect(
      await screen.findByRole('heading', { name: 'Privacy Policy' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    const back = screen.getByRole('link', { name: '← Back to settings' })
    back.focus()
    await router.navigate('/privacy?section=data', {
      state: { from: 'settings' },
    })
    expect(back).toHaveFocus()
  })
})
