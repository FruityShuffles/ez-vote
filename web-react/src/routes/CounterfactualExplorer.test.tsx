import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CounterfactualEditor,
  CounterfactualPicker,
} from '@/routes/CounterfactualExplorer'
import { ElectionWorkspace } from '@/components/ElectionWorkspace'
import { useCounterfactualStore } from '@/lib/counterfactualStore'
import type { Candidate, Election } from '@/lib/elections'
import type { SimulationResponse } from '@/lib/counterfactual'

const mocks = vi.hoisted(() => ({
  useElection: vi.fn(),
  useCandidates: vi.fn(),
  usePublicBallots: vi.fn(),
  useSimulate: vi.fn(),
  useFlipSearch: vi.fn(),
}))

vi.mock('@/lib/elections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/elections')>()),
  useElection: mocks.useElection,
  useCandidates: mocks.useCandidates,
  usePublicBallots: mocks.usePublicBallots,
}))

vi.mock('@/lib/counterfactual', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/counterfactual')>()),
  useSimulate: mocks.useSimulate,
  useFlipSearch: mocks.useFlipSearch,
}))

const election: Election = {
  id: 'e1',
  owner_id: 'owner',
  title: 'Public result',
  description: null,
  status: 'closed',
  algorithms: ['irv'],
  invite_mode: 'invite',
  allow_voter_candidates: false,
  realtime_results: false,
  include_fptp: false,
  public_ballots: true,
  candidates_updated_at: '',
  created_at: '',
  updated_at: '',
}

const candidates: Candidate[] = [
  { id: 'ada', election_id: 'e1', name: 'Ada', position: 0, created_at: '' },
  { id: 'bo', election_id: 'e1', name: 'Bo', position: 1, created_at: '' },
  { id: 'cy', election_id: 'e1', name: 'Cy', position: 2, created_at: '' },
]

const simulation: SimulationResponse = {
  election_id: 'e1',
  baseline: [
    {
      algorithm: 'irv',
      result_data: {
        winners: ['Ada'],
        rounds: [{ counts: { Ada: 1, Bo: 0, Cy: 1 }, eliminated: ['Bo'] }],
      },
    },
  ],
  simulated: [
    {
      algorithm: 'irv',
      result_data: {
        winners: ['Ada'],
        rounds: [{ counts: { Ada: 1, Bo: 0, Cy: 1 }, eliminated: ['Bo'] }],
      },
    },
  ],
  changed: { irv: false },
  ballot_count: { baseline: 1, simulated: 1 },
  applied: { replace: 0, remove: 0, add: 0 },
}

function renderRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/election/:id" element={<ElectionWorkspace />}>
          <Route path="explore" element={<CounterfactualPicker />} />
          <Route path="explore/:voterId" element={<CounterfactualEditor />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useCounterfactualStore.setState({
    electionId: null,
    edits: {},
    flipApplied: {},
  })
  mocks.useElection.mockReturnValue({
    data: election,
    isPending: false,
    isError: false,
  })
  mocks.useCandidates.mockReturnValue({
    data: candidates,
    isPending: false,
    isError: false,
  })
  mocks.usePublicBallots.mockReturnValue({
    data: [
      {
        voter_id: 'v1',
        display_name: 'Priya',
        payload: { irv: ['ada', 'bo', 'cy'] },
        updated_at: '',
      },
    ],
    isPending: false,
    isError: false,
  })
  mocks.useSimulate.mockReturnValue({
    data: simulation,
    isPending: false,
    isError: false,
    isFetching: false,
  })
  mocks.useFlipSearch.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })
})

describe('counterfactual route containers', () => {
  it('loads the picker, filters by candidate, and routes by voter id', async () => {
    const user = userEvent.setup()
    renderRoutes('/election/e1/explore')

    expect(
      screen.getByRole('heading', { name: 'Explore what-ifs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Priya' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Cy,/ }))
    expect(
      screen.getByText('No ballots match this filter.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Cy,/ }))
    await user.click(screen.getByRole('button', { name: 'Priya' }))
    expect(
      screen.getByRole('heading', { name: "Change Priya's ballot" }),
    ).toBeInTheDocument()
  })

  it('seeds a reopened editor from the pending hypothetical', () => {
    const original = { irv: ['ada', 'bo', 'cy'] }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .recordEdit('v1', original, { irv: ['ada', 'cy', 'bo'] })

    renderRoutes('/election/e1/explore/v1')

    const ballotCard = screen
      .getByText('Rank the Candidates')
      .closest('[data-slot="card"]')
    expect(ballotCard).not.toBeNull()
    const names = within(ballotCard as HTMLElement)
      .getAllByText(/^(Ada|Bo|Cy)$/)
      .map((node) => node.textContent)
    expect(names).toEqual(['Ada', 'Cy', 'Bo'])
    expect(screen.getByText('Changed ballot')).toBeInTheDocument()
  })

  it('offers the flip search only for IRV elections', () => {
    renderRoutes('/election/e1/explore')
    expect(
      screen.getByRole('region', { name: 'Flip the outcome' }),
    ).toBeInTheDocument()
  })

  it('hides the flip search when the election is not tabulated with IRV', () => {
    mocks.useElection.mockReturnValue({
      data: { ...election, algorithms: ['approval'] },
      isPending: false,
      isError: false,
    })
    renderRoutes('/election/e1/explore')
    expect(
      screen.queryByRole('region', { name: 'Flip the outcome' }),
    ).not.toBeInTheDocument()
  })

  it('keeps a server flip suggestion intact when its ballot is opened, until a manual edit replaces it', async () => {
    // A STAR+IRV election uses derivation template F: the editor rederives the
    // irv key from scores, so a server payload seeded into it would be mangled
    // on mount. The route must seed flip-marked voters from the original.
    const user = userEvent.setup()
    mocks.useElection.mockReturnValue({
      data: { ...election, algorithms: ['irv', 'star'] },
      isPending: false,
      isError: false,
    })
    mocks.usePublicBallots.mockReturnValue({
      data: [
        {
          voter_id: 'v1',
          display_name: 'Priya',
          payload: {
            star: { ada: 5, bo: 3, cy: 1 },
            irv: ['ada', 'bo', 'cy'],
          },
          updated_at: '',
        },
      ],
      isPending: false,
      isError: false,
    })
    // The server's suggestion: only the irv key rewritten, scores untouched —
    // exactly what the editor's template would discard.
    const suggested = {
      star: { ada: 5, bo: 3, cy: 1 },
      irv: ['cy', 'ada', 'bo'],
    }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .applyFlipChanges([{ voterId: 'v1', payload: suggested }])

    renderRoutes('/election/e1/explore/v1')

    // Opening the editor must not touch the suggestion.
    expect(
      screen.getByText(/A suggested change to this ballot is active/),
    ).toBeInTheDocument()
    expect(useCounterfactualStore.getState().edits.v1).toEqual(suggested)
    expect(useCounterfactualStore.getState().flipApplied).toEqual({ v1: true })

    // The full ledger labels the server-sourced chip.
    const ledger = screen.getByRole('region', { name: 'Your changes' })
    expect(within(ledger).getByText(/· suggested/)).toBeInTheDocument()

    // A manual edit wins: the suggestion is replaced and the marker drops.
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: 'Score for Cy' }),
      ).getByRole('radio', { name: '4' }),
    )
    expect(useCounterfactualStore.getState().flipApplied).toEqual({})
    expect(useCounterfactualStore.getState().edits.v1?.irv).toEqual([
      'ada',
      'cy',
      'bo',
    ])
  })

  it('rejects a direct route when the privacy/status gate is not met', () => {
    mocks.useElection.mockReturnValue({
      data: { ...election, public_ballots: false },
      isPending: false,
      isError: false,
    })
    renderRoutes('/election/e1/explore')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'available only for closed elections with public ballots',
    )
    expect(mocks.usePublicBallots).toHaveBeenCalledWith('e1', {
      enabled: false,
    })
  })
})
