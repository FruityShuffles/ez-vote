import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ElectionForm } from '@/routes/ElectionForm'
import type { Candidate, Election, ElectionFormInput } from '@/lib/elections'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn<(input: ElectionFormInput) => Promise<string>>(),
  election: undefined as Election | undefined,
  candidates: undefined as Candidate[] | undefined,
  userId: 'owner-1',
}))

vi.mock('@/auth/context', () => ({
  useAuth: () => ({ user: { id: mocks.userId }, session: {}, loading: false }),
}))

vi.mock('@/lib/elections', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/elections')>('@/lib/elections')
  return {
    ...actual,
    useElection: () => ({
      data: mocks.election,
      isPending: false,
      isError: false,
    }),
    useCandidates: () => ({
      data: mocks.candidates,
      isPending: false,
      isError: false,
    }),
    useSaveElection: () => ({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    }),
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const election: Election = {
  id: 'e1',
  owner_id: 'owner-1',
  title: 'Board Election',
  description: 'Choose a chair',
  status: 'draft',
  algorithms: ['irv', 'star'],
  invite_mode: 'open',
  allow_voter_candidates: true,
  realtime_results: false,
  include_fptp: false,
  public_ballots: true,
  candidates_updated_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const candidates: Candidate[] = ['Charlie', 'Alice', 'Bob'].map(
  (name, position) => ({
    id: `c${position}`,
    election_id: 'e1',
    name,
    position,
    created_at: '2026-01-01T00:00:00Z',
  }),
)

function renderRoute(path = '/create') {
  const router = createMemoryRouter(
    [
      { path: '/create', element: <ElectionForm /> },
      { path: '/election/:id/edit', element: <ElectionForm /> },
      { path: '/election/:id', element: <div>Election detail</div> },
      { path: '/dashboard', element: <div>Dashboard</div> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mocks.mutateAsync.mockReset()
  mocks.mutateAsync.mockResolvedValue('saved-1')
  mocks.election = undefined
  mocks.candidates = undefined
  mocks.userId = 'owner-1'
})

describe('M11 create election', () => {
  it('renders Flutter-parity defaults and corrected settings copy', () => {
    renderRoute()
    expect(
      screen.getByRole('heading', { name: 'Create Election' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Approval Voting' }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Include FPTP comparison' }),
    ).toBeChecked()
    expect(
      screen.getByText('Anyone in the election can see how each voter voted.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Cannot be changed after/),
    ).not.toBeInTheDocument()
  })

  it('validates title, candidate count, and algorithm selection before writing', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.click(screen.getByRole('checkbox', { name: 'Approval Voting' }))
    await user.click(screen.getByRole('button', { name: 'Save & Open' }))
    expect(screen.getByText('Title required')).toBeInTheDocument()
    expect(
      screen.getByText('At least 2 candidates required'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Select at least one algorithm'),
    ).toBeInTheDocument()
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('submits ordered candidates and independently selected feature flags', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(screen.getByLabelText('Election Title'), '  City Council  ')
    await user.type(screen.getByLabelText('Candidate 1'), 'Alice')
    await user.type(screen.getByLabelText('Candidate 2'), 'Bob')
    await user.click(
      screen.getByRole('button', { name: 'Move candidate 2 up' }),
    )
    await user.click(
      screen.getByRole('switch', { name: 'Allow voters to add candidates' }),
    )
    await user.click(
      screen.getByRole('switch', { name: 'Show real-time results' }),
    )
    await user.click(
      screen.getByRole('switch', { name: 'Include FPTP comparison' }),
    )
    await user.click(screen.getByRole('switch', { name: 'Public ballots' }))
    await user.click(screen.getByRole('button', { name: 'Save as Draft' }))

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'City Council',
        candidates: ['Bob', 'Alice'],
        allow_voter_candidates: true,
        realtime_results: true,
        include_fptp: false,
        public_ballots: true,
        open: false,
      }),
    )
    await waitFor(() =>
      expect(screen.getByText('Election detail')).toBeInTheDocument(),
    )
  })

  it('prompts before abandoning dirty form state', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(screen.getByLabelText('Election Title'), 'Draft')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Discard unsaved changes?',
    )
  })
})

describe('M11 edit election', () => {
  it('hydrates title, candidates in persisted order, algorithms, and flags', () => {
    mocks.election = election
    mocks.candidates = candidates
    renderRoute('/election/e1/edit')
    expect(
      screen.getByRole('heading', { name: 'Edit Election' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Election Title')).toHaveValue(
      'Board Election',
    )
    expect(
      screen
        .getAllByRole('textbox', { name: /Candidate/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['Charlie', 'Alice', 'Bob'])
    expect(
      screen.getByRole('checkbox', { name: 'Approval Voting' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Instant Runoff Voting (IRV)' }),
    ).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'STAR Voting' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Public ballots' })).toBeChecked()
  })

  it('refuses edit UI to a non-owner', () => {
    mocks.election = election
    mocks.candidates = candidates
    mocks.userId = 'other-user'
    renderRoute('/election/e1/edit')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This draft cannot be edited.',
    )
  })
})
