import { act, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/auth/context'
import { Breadcrumbs, ElectionCrumb } from '@/components/Breadcrumbs'

const mocks = vi.hoisted(() => ({
  query: { isPending: true } as {
    isPending: boolean
    data?: { owner_id: string; title: string; showcase?: boolean }
  },
}))

vi.mock('@/lib/elections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/elections')>()),
  useElection: () => mocks.query,
}))

function Layout() {
  return (
    <>
      <Breadcrumbs />
      <Outlet />
    </>
  )
}

function renderBreadcrumbs(userId = 'owner') {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          {
            path: '/election/:id',
            handle: { crumb: ElectionCrumb },
            children: [
              {
                path: 'explore',
                handle: { crumb: 'Explore' },
                element: <div>Explorer</div>,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/election/e1/explore'] },
  )
  const auth: AuthContextValue = {
    session: { user: { id: userId } } as Session,
    user: { id: userId } as Session['user'],
    loading: false,
    isGuest: false,
    continueAsGuest: () => undefined,
  }
  const ui = (
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  )
  return { ...render(ui), router }
}

describe('election breadcrumbs', () => {
  it('shows a skeleton on a cold deep link, then the owned election title', async () => {
    mocks.query = { isPending: true }
    const view = renderBreadcrumbs()
    expect(screen.getByLabelText('Loading election title')).toBeInTheDocument()

    mocks.query = {
      isPending: false,
      data: { owner_id: 'owner', title: 'Budget Vote' },
    }
    await act(() => view.router.navigate('/election/e1/explore?loaded=1'))

    expect(screen.getByRole('link', { name: 'My Elections' })).toHaveAttribute(
      'href',
      '/dashboard?tab=elections',
    )
    expect(
      screen.getByRole('link', { name: 'Budget Vote' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Explore')).toHaveAttribute('aria-current', 'page')
  })

  it('sends a participant back to the same merged tab as the owner', () => {
    mocks.query = {
      isPending: false,
      data: { owner_id: 'someone-else', title: 'Team Lunch' },
    }
    renderBreadcrumbs('voter')

    expect(screen.getByRole('link', { name: 'My Elections' })).toHaveAttribute(
      'href',
      '/dashboard?tab=elections',
    )
  })

  it('sends a case-study viewer back to the Case Studies tab', () => {
    mocks.query = {
      isPending: false,
      data: {
        owner_id: 'case-study-owner',
        title: 'When More Support Hurts',
        showcase: true,
      },
    }
    renderBreadcrumbs('viewer')

    expect(screen.getByRole('link', { name: 'Case Studies' })).toHaveAttribute(
      'href',
      '/dashboard?tab=case-studies',
    )
  })
})
