import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  MemoryRouter,
  Outlet,
  RouterProvider,
  useParams,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BallotCountRow } from '@/components/elections/BallotCountRow'
import { AuthContext, type AuthContextValue } from '@/auth/context'
import { Breadcrumbs, ElectionCrumb } from '@/components/Breadcrumbs'
import { ElectionWorkspace } from '@/components/ElectionWorkspace'
import { PublicBallot } from '@/routes/PublicBallot'

const ballots = ['Ada', 'Bo', 'Cy'].map((display_name, index) => ({
  voter_id: `v${index}`,
  display_name,
  payload: { approval: ['c1'] },
  updated_at: '2026-01-01T00:00:00Z',
}))

vi.mock('@/lib/elections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/elections')>()),
  useBallotCount: () => ({ data: ballots.length, isPending: false, isError: false }),
  useElectionVoters: () => ({ data: [], isPending: false, isError: false }),
  usePublicBallots: () => ({ data: ballots, isPending: false, isError: false }),
  useElection: () => ({
    data: {
      id: 'e1',
      owner_id: 'owner',
      title: 'Election One',
      algorithms: ['approval'],
      include_fptp: false,
    },
    isPending: false,
    isError: false,
  }),
  useCandidates: () => ({ data: [], isPending: false, isError: false }),
}))

vi.mock('@/lib/useBallotState', () => ({ useBallotState: () => ({}) }))
vi.mock('@/components/ballot/BallotView', () => ({
  BallotView: () => <div>Read-only ballot</div>,
}))

function Overview() {
  const { id = '' } = useParams<{ id: string }>()
  return <BallotCountRow electionId={id} publicBallots />
}

function TestLayout() {
  return (
    <>
      <Breadcrumbs />
      <Outlet />
    </>
  )
}

const auth = {
  session: {} as AuthContextValue['session'],
  user: { id: 'owner' } as AuthContextValue['user'],
  loading: false,
}

function renderFlow(initialEntry = '/election/e1') {
  const router = createMemoryRouter(
    [
      {
        element: <TestLayout />,
        children: [
          {
            path: '/election/:id',
            children: [
              {
                element: <ElectionWorkspace />,
                handle: { crumb: ElectionCrumb },
                children: [
                  { index: true, element: <Overview /> },
                  {
                    path: 'ballot/:index',
                    element: <PublicBallot />,
                    handle: { crumb: 'Ballot' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

beforeEach(() => vi.clearAllMocks())

it('renders a non-interactive count when voter details are restricted', () => {
  render(
    <MemoryRouter>
      <BallotCountRow
        electionId="e1"
        publicBallots
        canViewVoterDetails={false}
      />
    </MemoryRouter>,
  )

  expect(screen.getByText('3 ballots submitted')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '3 ballots submitted' }),
  ).not.toBeInTheDocument()
})

describe('addressable voters dialog history', () => {
  it('returns from a ballot to the dialog without creating a back loop', async () => {
    const user = userEvent.setup()
    const router = renderFlow()

    await user.click(screen.getByRole('button', { name: '3 ballots submitted' }))
    expect(router.state.location.search).toBe('?voters=open')
    await user.click(screen.getAllByRole('button', { name: 'View ballot' })[1])
    expect(router.state.location.pathname).toBe('/election/e1/ballot/1')
    expect(router.state.location.state).toEqual({ from: 'voters' })

    await user.click(screen.getByRole('link', { name: 'Election One' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/election/e1?voters=open',
    )

    await router.navigate(-1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/election/e1')
    expect(router.state.location.search).toBe('')
  })

  it('keeps the voters origin while paging through ballots', async () => {
    const user = userEvent.setup()
    const router = renderFlow()

    await user.click(screen.getByRole('button', { name: '3 ballots submitted' }))
    await user.click(screen.getAllByRole('button', { name: 'View ballot' })[0])
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(router.state.location.pathname).toBe('/election/e1/ballot/2')
    expect(router.state.location.state).toEqual({ from: 'voters' })
    await user.click(screen.getByRole('link', { name: 'Election One' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('gives a cold ballot deep link a concrete voters-dialog back path', async () => {
    const user = userEvent.setup()
    const router = renderFlow('/election/e1/ballot/2')

    await user.click(screen.getByRole('link', { name: 'Election One' }))

    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/election/e1?voters=open',
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
