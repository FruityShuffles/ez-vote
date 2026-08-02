import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  RouterProvider,
  type InitialEntry,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ElectionEdit, ElectionForm } from '@/routes/ElectionForm'
import { ElectionWorkspace } from '@/components/ElectionWorkspace'
import {
  electionDraftKey,
  writeElectionDraft,
  type ElectionDraftForm,
} from '@/lib/electionDrafts'
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

function renderRoute(
  path = '/create',
  initialEntries: InitialEntry[] = [path],
) {
  const router = createMemoryRouter(
    [
      { path: '/create', element: <ElectionForm /> },
      {
        path: '/election/:id',
        element: <ElectionWorkspace />,
        children: [
          { index: true, element: <div>Election detail</div> },
          { path: 'edit', element: <ElectionEdit /> },
        ],
      },
      { path: '/dashboard', element: <div>Dashboard</div> },
    ],
    { initialEntries },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  window.localStorage.clear()
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
      screen.getByRole('checkbox', {
        name: 'First Past the Post (FPTP) comparison',
      }),
    ).toBeChecked()
    expect(
      screen.getByText('Anyone in the election can see how each voter voted.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Cannot be changed after/),
    ).not.toBeInTheDocument()
  })

  it('exposes each form section as an h2 so screen readers can navigate by heading', () => {
    renderRoute()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Candidates', 'Voting Algorithms', 'Settings'])
  })

  it('opens the algorithm explainer on the current form path', () => {
    renderRoute()
    expect(
      screen.getByRole('link', { name: /What.s the difference\?/ }),
    ).toHaveAttribute('href', '/create?learn=approval')
    expect(
      screen.getByText(/candidate with the most first choices wins/),
    ).toBeInTheDocument()
  })

  it('keeps a create draft intact when browser Back closes the explainer', async () => {
    const user = userEvent.setup()
    const router = renderRoute()
    const title = screen.getByLabelText('Election Title')
    await user.type(title, 'Draft title')
    await user.click(
      screen.getByRole('link', { name: /What.s the difference\?/ }),
    )

    expect(router.state.location.pathname).toBe('/create')
    expect(router.state.location.search).toBe('?learn=approval')
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Discard unsaved changes?'),
    ).not.toBeInTheDocument()

    await router.navigate(-1)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(title).toHaveValue('Draft title')
    expect(
      screen.queryByText('Discard unsaved changes?'),
    ).not.toBeInTheDocument()
  })

  it('keeps an edit draft intact when browser Back closes the explainer', async () => {
    const user = userEvent.setup()
    mocks.election = election
    mocks.candidates = candidates
    const router = renderRoute('/election/e1/edit')
    const title = await screen.findByLabelText('Election Title')
    await user.type(title, ' revised')
    await user.click(
      screen.getByRole('link', { name: /What.s the difference\?/ }),
    )

    expect(router.state.location.pathname).toBe('/election/e1/edit')
    expect(router.state.location.search).toBe('?learn=approval')
    await router.navigate(-1)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(title).toHaveValue('Board Election revised')
    expect(
      screen.queryByText('Discard unsaved changes?'),
    ).not.toBeInTheDocument()
  })

  it('restores a create draft after the form remounts', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(
      screen.getByLabelText('Election Title'),
      'Reload-safe draft',
    )
    await user.type(screen.getByLabelText('Candidate 1'), 'Ada')
    await waitFor(() =>
      expect(window.localStorage.getItem(electionDraftKey())).not.toBeNull(),
    )

    cleanup()
    renderRoute()

    expect(screen.getByLabelText('Election Title')).toHaveValue(
      'Reload-safe draft',
    )
    expect(screen.getByLabelText('Candidate 1')).toHaveValue('Ada')
  })

  it('closes a direct explainer deep link without leaving the app', async () => {
    const user = userEvent.setup()
    const router = renderRoute('/create?learn=fptp')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe('/create')
    expect(router.state.location.search).toBe('')
  })

  it('preserves the origin marker while switching explainer algorithms', async () => {
    const user = userEvent.setup()
    const router = renderRoute()
    const trigger = screen.getByRole('link', {
      name: /What.s the difference\?/,
    })
    await user.click(trigger)
    await user.click(screen.getByRole('tab', { name: 'STAR' }))

    expect(router.state.location.search).toBe('?learn=star')
    expect(router.state.location.state).toEqual({ from: 'learn-dialog' })
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe('/create')
    expect(router.state.location.search).toBe('')
    expect(trigger).toHaveFocus()
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
      screen.getByText('Select at least one of Approval, IRV, or STAR'),
    ).toBeInTheDocument()
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  // #130 moved FPTP into the Voting Algorithms group, but it still only
  // reinterprets ballots cast for another method — it cannot stand alone.
  it('does not accept the FPTP comparison as the only selected method', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(screen.getByLabelText('Election Title'), 'City Council')
    await user.type(screen.getByLabelText('Candidate 1'), 'Alice')
    await user.type(screen.getByLabelText('Candidate 2'), 'Bob')
    await user.click(screen.getByRole('checkbox', { name: 'Approval Voting' }))

    expect(
      screen.getByRole('checkbox', {
        name: 'First Past the Post (FPTP) comparison',
      }),
    ).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save & Open' }))

    expect(
      screen.getByText('Select at least one of Approval, IRV, or STAR'),
    ).toBeInTheDocument()
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('submits ordered candidates and independently selected feature flags', async () => {
    const user = userEvent.setup()
    const router = renderRoute()
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
      screen.getByRole('checkbox', {
        name: 'First Past the Post (FPTP) comparison',
      }),
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
      expect(router.state.location.pathname).toBe('/election/saved-1'),
    )
    expect(window.localStorage.getItem(electionDraftKey())).toBeNull()
  })

  it('spells out that Open starts voting and Draft does not', () => {
    renderRoute()
    expect(
      screen.getByText(/voters can start voting right away/),
    ).toHaveTextContent('Draft — keep editing privately.')
  })

  it('drops that line in edit mode, where there is no draft button to explain', () => {
    mocks.election = election
    mocks.candidates = candidates
    renderRoute('/election/e1/edit')
    expect(
      screen.getByRole('button', { name: 'Save Changes' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/voters can start voting right away/),
    ).not.toBeInTheDocument()
  })

  it('replaces a dashboard-entered editor so Back cannot reopen it', async () => {
    const user = userEvent.setup()
    mocks.election = election
    mocks.candidates = candidates
    const router = renderRoute('/election/e1/edit', [
      '/dashboard',
      {
        pathname: '/election/e1/edit',
        state: { from: 'dashboard' },
      },
    ])

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(router.state.location.pathname).toBe('/election/e1')
    await act(() => router.navigate(-1))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('lets a dirty form leave without a prompt, keeping the draft (#132)', async () => {
    const user = userEvent.setup()
    const router = renderRoute()
    await user.type(screen.getByLabelText('Election Title'), 'Draft')
    await waitFor(() =>
      expect(window.localStorage.getItem(electionDraftKey())).not.toBeNull(),
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(router.state.location.pathname).toBe('/dashboard')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(electionDraftKey())).not.toBeNull()
  })
})

describe('#118 self-growing candidate list', () => {
  const rows = () => screen.getAllByRole('textbox', { name: /andidate/ })

  it('starts at two required rows with no add button and no open slot yet', () => {
    renderRoute()
    expect(
      screen.queryByRole('button', { name: 'Add Candidate' }),
    ).not.toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(
      screen.queryByLabelText('Add another candidate'),
    ).not.toBeInTheDocument()
  })

  it('advances focus on Enter without submitting the form', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.click(screen.getByLabelText('Candidate 1'))
    await user.keyboard('Alice{Enter}')
    expect(screen.getByLabelText('Candidate 2')).toHaveFocus()
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('appends an open slot once every row is filled, and Enter lands on it', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.click(screen.getByLabelText('Candidate 1'))
    await user.keyboard('Alice{Enter}Bob')

    const slot = screen.getByLabelText('Add another candidate')
    expect(rows()).toHaveLength(3)
    await user.keyboard('{Enter}')
    expect(slot).toHaveFocus()

    // Enter on the open slot is a no-op: no submit, no second empty row.
    await user.keyboard('{Enter}')
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(3)
  })

  it('gives the open slot no reorder or remove controls', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(screen.getByLabelText('Candidate 1'), 'Alice')
    await user.type(screen.getByLabelText('Candidate 2'), 'Bob')

    expect(screen.getByLabelText('Add another candidate')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Move candidate 3 up' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Move candidate 3 down' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Remove candidate/ }),
    ).not.toBeInTheDocument()
  })

  it('collapses an emptied row on blur but never below two rows', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.click(screen.getByLabelText('Candidate 1'))
    await user.keyboard('Alice{Enter}Bob{Enter}Carol')
    expect(rows()).toHaveLength(4)

    await user.clear(screen.getByLabelText('Candidate 2'))
    await user.click(screen.getByLabelText('Candidate 1'))
    expect(rows().map((input) => (input as HTMLInputElement).value)).toEqual([
      'Alice',
      'Carol',
      '',
    ])

    // Floor of two: clearing down to a single name keeps the second row.
    await user.clear(screen.getByLabelText('Candidate 2'))
    await user.click(screen.getByLabelText('Candidate 1'))
    expect(rows().map((input) => (input as HTMLInputElement).value)).toEqual([
      'Alice',
      '',
    ])
  })

  it('submits only the non-empty names', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.type(screen.getByLabelText('Election Title'), 'City Council')
    await user.click(screen.getByLabelText('Candidate 1'))
    await user.keyboard('Alice{Enter}Bob')
    await user.click(screen.getByRole('button', { name: 'Save as Draft' }))

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: ['Alice', 'Bob'] }),
    )
  })

  it('splits a multi-line paste into one row per line', async () => {
    const user = userEvent.setup()
    renderRoute()
    await user.click(screen.getByLabelText('Candidate 1'))
    await user.paste('Alice\nBob\n Carol \n\n')

    expect(rows().map((input) => (input as HTMLInputElement).value)).toEqual([
      'Alice',
      'Bob',
      'Carol',
      '',
    ])
    expect(screen.getByLabelText('Candidate 3')).toHaveFocus()
  })
})

describe('M11 edit election', () => {
  const localEdit: ElectionDraftForm = {
    title: 'Local board draft',
    description: 'Unsaved local changes',
    algorithms: ['approval'],
    allow_voter_candidates: false,
    realtime_results: true,
    include_fptp: true,
    public_ballots: false,
    candidates: [
      { id: 'local-1', name: 'Ada' },
      { id: 'local-2', name: 'Grace' },
    ],
  }

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

  it('resumes an edit draft based on the same server version', () => {
    writeElectionDraft(electionDraftKey('e1'), localEdit, election.updated_at)
    mocks.election = election
    mocks.candidates = candidates

    renderRoute('/election/e1/edit')

    expect(screen.getByLabelText('Election Title')).toHaveValue(
      'Local board draft',
    )
    expect(screen.getByLabelText('Candidate 1')).toHaveValue('Ada')
  })

  it('drops an edit draft when the freshly loaded server version changed', () => {
    const key = electionDraftKey('e1')
    writeElectionDraft(key, localEdit, '2025-12-31T00:00:00Z')
    mocks.election = election
    mocks.candidates = candidates

    renderRoute('/election/e1/edit')

    expect(screen.getByLabelText('Election Title')).toHaveValue(
      'Board Election',
    )
    expect(window.localStorage.getItem(key)).toBeNull()
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
