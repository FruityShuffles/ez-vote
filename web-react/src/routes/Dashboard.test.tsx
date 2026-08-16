import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { AuthContext, type AuthContextValue } from '@/auth/context'
import type { Election } from '@/lib/elections'
import { Dashboard } from '@/routes/Dashboard'

const emptyList = { data: [], isPending: false, isError: false }

const mocks = vi.hoisted(() => ({
  owned: [] as unknown[],
  voted: [] as unknown[],
  invited: [] as unknown[],
  caseStudies: [] as unknown[],
  ballotCount: undefined as number | undefined,
  winners: [] as string[],
  ownedHook: vi.fn(),
  votedHook: vi.fn(),
  invitedHook: vi.fn(),
}))

vi.mock('@/lib/elections', () => ({
  useOwnedElections: () => {
    mocks.ownedHook()
    return { ...emptyList, data: mocks.owned }
  },
  useVotedElections: () => {
    mocks.votedHook()
    return { ...emptyList, data: mocks.voted }
  },
  usePendingInvitations: () => {
    mocks.invitedHook()
    return { ...emptyList, data: mocks.invited }
  },
  useCaseStudies: () => ({ ...emptyList, data: mocks.caseStudies }),
  useBallotCount: () => ({ data: mocks.ballotCount }),
  useDeleteElection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/results', () => ({
  useElectionResults: () => ({ data: [] }),
  winnerNames: () => mocks.winners,
  winnersLabel: () => '',
  RESULT_ALGORITHM_ORDER: ['approval', 'irv', 'star', 'fptp'],
}))

vi.mock('@/lib/auth', () => ({
  signOut: vi.fn(),
}))

function election(overrides: Partial<Election> & { id: string }): Election {
  return {
    owner_id: 'someone-else',
    title: overrides.id,
    description: null,
    status: 'open',
    algorithms: ['approval'],
    invite_mode: 'open',
    allow_voter_candidates: false,
    realtime_results: false,
    include_fptp: false,
    public_ballots: false,
    visibility: 'private',
    showcase: false,
    candidates_updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderDashboard(path = '/dashboard', isGuest = false) {
  const router = createMemoryRouter(
    [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/election/:id', element: <div>Election</div> },
    ],
    { initialEntries: [path] },
  )
  const auth: AuthContextValue = {
    session: isGuest ? null : ({ user: { id: 'me' } } as Session),
    user: isGuest ? null : ({ id: 'me' } as Session['user']),
    loading: false,
    isGuest,
    continueAsGuest: () => undefined,
  }
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

function setLists(lists: Partial<typeof mocks>) {
  mocks.owned = lists.owned ?? []
  mocks.voted = lists.voted ?? []
  mocks.invited = lists.invited ?? []
  mocks.caseStudies = lists.caseStudies ?? []
  mocks.ballotCount = lists.ballotCount
  mocks.winners = lists.winners ?? []
}

beforeEach(() => {
  mocks.ownedHook.mockClear()
  mocks.votedHook.mockClear()
  mocks.invitedHook.mockClear()
})

describe('Dashboard', () => {
  it('shows the merged elections tab alongside Learn', () => {
    setLists({})
    renderDashboard()
    const tablist = screen.getByRole('tablist', { name: 'Dashboard sections' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'My Elections',
      'Learn',
      'Case Studies',
    ])
  })

  it('renders the voting-algorithm explainer on the Learn tab', async () => {
    setLists({})
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
    setLists({})
    const router = renderDashboard('/dashboard?tab=learn')
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await act(() => router.navigate('/election/e1'))
    expect(screen.getByText('Election')).toBeInTheDocument()
    await act(() => router.navigate(-1))

    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it.each(['owned', 'votes', 'missing'])(
    'resolves the legacy or unknown tab value %s to My Elections',
    (value) => {
      setLists({})
      renderDashboard(`/dashboard?tab=${value}`)
      expect(screen.getByRole('tab', { name: 'My Elections' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(
        screen.getByText('No elections yet. Create one!'),
      ).toBeInTheDocument()
    },
  )

  it('resolves the Case Studies deep link and lists showcase elections without relationship actions', () => {
    setLists({
      caseStudies: [
        election({
          id: 'study-1',
          title: 'When More Support Hurts',
          status: 'closed',
          visibility: 'public',
          showcase: true,
        }),
      ],
    })
    renderDashboard('/dashboard?tab=case-studies')

    expect(screen.getByRole('tab', { name: 'Case Studies' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('When More Support Hurts')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('You created this election'),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("You've voted")).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Delete When More Support Hurts/ }),
    ).not.toBeInTheDocument()
  })

  it('shows the Case Studies empty state', () => {
    setLists({})
    renderDashboard('/dashboard?tab=case-studies')
    expect(
      screen.getByText('No case studies are available yet.'),
    ).toBeInTheDocument()
  })

  it('defaults guests to Case Studies and locks account-owned features', async () => {
    setLists({
      caseStudies: [
        election({
          id: 'study-1',
          title: 'When More Support Hurts',
          status: 'closed',
          visibility: 'public',
          showcase: true,
        }),
      ],
    })
    const user = userEvent.setup()
    renderDashboard('/dashboard', true)

    expect(screen.getByRole('tab', { name: 'Case Studies' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('When More Support Hurts')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'New Election' }),
    ).not.toBeInTheDocument()
    expect(mocks.ownedHook).not.toHaveBeenCalled()
    expect(mocks.votedHook).not.toHaveBeenCalled()
    expect(mocks.invitedHook).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'My Elections' }))
    expect(
      screen.getByRole('heading', {
        name: 'Create an account for your elections',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute('href', '/signup')
    expect(mocks.ownedHook).not.toHaveBeenCalled()
    expect(mocks.votedHook).not.toHaveBeenCalled()
    expect(mocks.invitedHook).not.toHaveBeenCalled()
  })

  it('lists an election you own and voted in exactly once', () => {
    const mine = election({ id: 'e1', owner_id: 'me', title: 'Budget Vote' })
    setLists({ owned: [mine], voted: [mine] })
    renderDashboard()

    expect(screen.getAllByText('Budget Vote')).toHaveLength(1)
    expect(
      screen.getByLabelText('You created this election'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("You've voted")).toBeInTheDocument()
    expect(
      screen.queryByLabelText("You haven't voted yet"),
    ).not.toBeInTheDocument()
  })

  it('marks an open invitation as not yet voted, without an owner icon', () => {
    setLists({ invited: [election({ id: 'e2', title: 'Team Lunch' })] })
    renderDashboard()

    expect(screen.getByLabelText("You haven't voted yet")).toBeInTheDocument()
    expect(
      screen.queryByLabelText('You created this election'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete Team Lunch' }),
    ).not.toBeInTheDocument()
  })

  it('shows no vote status on an owned draft, but keeps the delete action', () => {
    setLists({
      owned: [
        election({ id: 'e3', owner_id: 'me', title: 'Retro', status: 'draft' }),
      ],
    })
    renderDashboard()

    expect(
      screen.getByLabelText('You created this election'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("You've voted")).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("You haven't voted yet"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete Retro' }),
    ).toBeInTheDocument()
  })

  it('labels every column on My Elections', () => {
    setLists({
      owned: [election({ id: 'e1', owner_id: 'me', title: 'Budget Vote' })],
    })
    renderDashboard()

    expect(
      screen.getByRole('list', { name: 'My elections' }),
    ).toBeInTheDocument()
    for (const label of [
      'Election',
      'Winner',
      'Methods',
      'Ballots',
      'Voted',
      'Owner',
      'Status',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('drops the viewer columns on Case Studies', () => {
    setLists({
      caseStudies: [election({ id: 's1', title: 'When More Support Hurts' })],
    })
    renderDashboard('/dashboard?tab=case-studies')

    expect(
      screen.getByRole('list', { name: 'Case studies' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Winner')).toBeInTheDocument()
    expect(screen.queryByText('Voted')).not.toBeInTheDocument()
    expect(screen.queryByText('Owner')).not.toBeInTheDocument()
  })

  it('tags each election with its voting methods in canonical order', () => {
    setLists({
      owned: [
        election({
          id: 'e1',
          owner_id: 'me',
          title: 'Budget Vote',
          algorithms: ['star', 'approval'],
          include_fptp: true,
        }),
      ],
    })
    renderDashboard()

    const row = screen.getByRole('listitem')
    const tags = within(row)
      .getAllByText(/^(Approval|IRV|STAR|FPTP)$/)
      .map((el) => el.textContent)
    expect(tags).toEqual(['Approval', 'STAR', 'FPTP'])
  })

  it('gives the ballot count and winner their own cells, and drops the description', () => {
    setLists({
      owned: [
        election({
          id: 'e1',
          owner_id: 'me',
          title: 'Team Lunch',
          description: 'Where we go on Friday',
          status: 'closed',
        }),
      ],
      ballotCount: 8,
      winners: ['Ramen'],
    })
    renderDashboard()

    // Value and unit are separate elements so the unit can go `sr-only` once
    // the column header carries it.
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('ballots')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
    expect(screen.getByText('Winner:')).toBeInTheDocument()
    expect(
      screen.queryByText(/Where we go on Friday/),
    ).not.toBeInTheDocument()
  })

  it('orders the merged list newest first', () => {
    setLists({
      owned: [
        election({
          id: 'old',
          title: 'Older',
          created_at: '2026-01-01T00:00:00Z',
        }),
      ],
      voted: [
        election({
          id: 'new',
          title: 'Newer',
          created_at: '2026-06-01T00:00:00Z',
        }),
      ],
    })
    renderDashboard()

    const titles = screen
      .getAllByText(/^(Older|Newer)$/)
      .map((el) => el.textContent)
    expect(titles).toEqual(['Newer', 'Older'])
  })
})
