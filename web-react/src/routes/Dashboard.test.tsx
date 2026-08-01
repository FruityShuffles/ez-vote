import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { Dashboard } from '@/routes/Dashboard'

const emptyList = { data: [], isPending: false, isError: false }

vi.mock('@/lib/elections', () => ({
  useOwnedElections: () => emptyList,
  usePendingInvitations: () => emptyList,
  useVotedElections: () => emptyList,
}))

vi.mock('@/lib/auth', () => ({
  signOut: vi.fn(),
}))

function renderDashboard(path = '/dashboard') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/election/:id', element: <div>Election</div> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('Dashboard', () => {
  it('shows the three Flutter-parity tabs', () => {
    renderDashboard()
    const tablist = screen.getByRole('tablist', { name: 'Dashboard sections' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'My Elections',
      'My Votes',
      'Learn',
    ])
  })

  it('renders the voting-algorithm explainer on the Learn tab', async () => {
    const user = userEvent.setup()
    const router = renderDashboard('/dashboard?source=home')
    await user.click(screen.getByRole('tab', { name: 'Learn' }))
    expect(router.state.location.search).toBe('?source=home&tab=learn')
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: 'Voting algorithm' }),
    ).toBeInTheDocument()
  })

  it('restores the selected tab after navigating to an election and back', async () => {
    const router = renderDashboard('/dashboard?tab=votes')
    expect(screen.getByRole('tab', { name: 'My Votes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await act(() => router.navigate('/election/e1'))
    expect(screen.getByText('Election')).toBeInTheDocument()
    await act(() => router.navigate(-1))

    expect(screen.getByRole('tab', { name: 'My Votes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('falls back to My Elections for an unknown tab value', () => {
    renderDashboard('/dashboard?tab=missing')
    expect(screen.getByRole('tab', { name: 'My Elections' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('No elections yet. Create one!')).toBeInTheDocument()
  })
})
