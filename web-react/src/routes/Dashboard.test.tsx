import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
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
    renderDashboard()
    await user.click(screen.getByRole('tab', { name: 'Learn' }))
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: 'Voting algorithm' }),
    ).toBeInTheDocument()
  })
})
