import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/auth/context'
import { InitialRouteFallback } from '@/components/RoutePending'
import { RootLayout } from '@/components/RootLayout'
import { RouteError } from '@/components/RouteError'
import { AppShell } from '@/components/ui/app-shell'
import { routes } from '@/router'

beforeAll(() => vi.stubGlobal('scrollTo', vi.fn()))

const LOGGED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  isGuest: false,
  continueAsGuest: () => undefined,
}
const GUEST: AuthContextValue = { ...LOGGED_OUT, isGuest: true }
const LOADING: AuthContextValue = { ...LOGGED_OUT, loading: true }
const LOGGED_IN: AuthContextValue = {
  session: { user: { id: 'u1' } } as Session,
  user: { id: 'u1' } as Session['user'],
  loading: false,
  isGuest: false,
  continueAsGuest: () => undefined,
}

function renderRoutes(
  routeObjects: RouteObject[],
  path: string,
  auth: AuthContextValue,
) {
  const router = createMemoryRouter(routeObjects, { initialEntries: [path] })
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

function renderRoute(path: string, auth: AuthContextValue) {
  return renderRoutes(routes, path, auth)
}

describe('nested application routes', () => {
  it('renders one authenticated app shell around protected content', async () => {
    renderRoute('/settings', LOGGED_IN)

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Settings' },
        { timeout: 5_000 },
      ),
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

  it('does not flash the authenticated app bar while auth is loading', async () => {
    renderRoute('/settings', LOADING)

    expect(await screen.findByText('Loading…')).toBeInTheDocument()
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

  it('renders guest chrome without account-only actions', async () => {
    renderRoute('/settings', GUEST)

    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
  })

  it.each([
    ['/create', '/signup?redirect=%2Fcreate'],
    ['/election/e1/edit', '/signup?redirect=%2Felection%2Fe1%2Fedit'],
    ['/election/e1/vote', '/signup?redirect=%2Felection%2Fe1%2Fvote'],
    ['/election/e1/join', '/signup?redirect=%2Felection%2Fe1%2Fjoin'],
  ])(
    'redirects a guest account-only route %s to signup',
    async (path, expected) => {
      const router = renderRoute(path, GUEST)
      await waitFor(() =>
        expect(
          router.state.location.pathname + router.state.location.search,
        ).toBe(expected),
      )
    },
  )

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

  it('shows route-level pending UI while a lazy screen chunk loads', async () => {
    const user = userEvent.setup()
    let resolveChunk!: (route: { Component: React.ComponentType }) => void
    const slowChunk = new Promise<{ Component: React.ComponentType }>(
      (resolve) => {
        resolveChunk = resolve
      },
    )
    const testRoutes: RouteObject[] = [
      {
        path: '/',
        element: <RootLayout />,
        hydrateFallbackElement: <InitialRouteFallback />,
        errorElement: (
          <AppShell brandTo="/" width="md">
            <RouteError />
          </AppShell>
        ),
        children: [
          { index: true, element: <Link to="/slow">Open slow route</Link> },
          { path: 'slow', lazy: () => slowChunk },
        ],
      },
    ]
    renderRoutes(testRoutes, '/', LOGGED_OUT)

    await user.click(screen.getByRole('link', { name: 'Open slow route' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Loading page…')

    await act(() =>
      resolveChunk({ Component: () => <h1>Lazy route ready</h1> }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Lazy route ready' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the app error boundary when a lazy chunk rejects', async () => {
    const user = userEvent.setup()
    const testRoutes: RouteObject[] = [
      {
        path: '/',
        element: <RootLayout />,
        hydrateFallbackElement: <InitialRouteFallback />,
        errorElement: (
          <AppShell brandTo="/" width="md">
            <RouteError />
          </AppShell>
        ),
        children: [
          { index: true, element: <Link to="/broken">Open broken route</Link> },
          {
            path: 'broken',
            lazy: async () => {
              throw new Error('chunk unavailable')
            },
          },
        ],
      },
    ]
    renderRoutes(testRoutes, '/', LOGGED_OUT)

    await user.click(screen.getByRole('link', { name: 'Open broken route' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong while loading this page.',
    )
    expect(screen.queryByText('Unexpected Application Error!')).toBeNull()
  })
})
