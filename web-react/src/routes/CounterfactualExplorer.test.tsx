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
  useStrategySearch: vi.fn(),
  useStoredSearches: vi.fn(),
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
  useStrategySearch: mocks.useStrategySearch,
  useStoredSearches: mocks.useStoredSearches,
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
  visibility: 'private',
  showcase: false,
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
    activeSuggestion: null,
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
  mocks.useStrategySearch.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })
  // Default: no precomputed row, so the existing tests keep exercising the
  // user-initiated fallback path.
  mocks.useStoredSearches.mockReturnValue({
    data: { flip: null, strategy: null },
    isPending: false,
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
    // The banner counts the marked controls, and Bo/Cy swapping marks both (#137).
    expect(screen.getByText('2 changes to their ballot')).toBeInTheDocument()
    expect(
      within(ballotCard as HTMLElement).getAllByText(/^was (2nd|3rd)$/),
    ).toHaveLength(2)
  })

  it('offers the flip search only for IRV elections', () => {
    renderRoutes('/election/e1/explore')
    expect(
      screen.getByRole('region', { name: 'Flip the outcome' }),
    ).toBeInTheDocument()
  })

  it('puts both searches above the ballot list, strategy first (#149)', () => {
    renderRoutes('/election/e1/explore')

    const strategy = screen.getByRole('region', { name: 'Strategic voting' })
    const flip = screen.getByRole('region', { name: 'Flip the outcome' })
    const ballotList = screen.getByRole('button', { name: 'Priya' })

    // Node.compareDocumentPosition: 4 = "the argument follows this node".
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
    expect(strategy.compareDocumentPosition(flip) & FOLLOWING).toBeTruthy()
    expect(flip.compareDocumentPosition(ballotList) & FOLLOWING).toBeTruthy()
  })

  it('renders a precomputed strategic search with no button press (#149)', () => {
    mocks.useStoredSearches.mockReturnValue({
      data: {
        flip: null,
        strategy: {
          opportunities: [
            {
              algorithm: 'irv',
              voter_id: 'v1',
              payload: { irv: ['bo', 'ada', 'cy'] },
              baseline_winners: ['Ada'],
              winners: ['Bo'],
              shared_by: 1,
            },
          ],
          algorithms_searched: ['irv'],
          distinct_ballots: 2,
          ballots_examined: 2,
          tabulations_used: 9,
          budget: 300,
          budget_exhausted: false,
        },
      },
      isPending: false,
    })
    renderRoutes('/election/e1/explore')

    const panel = screen.getByRole('region', { name: 'Strategic voting' })
    expect(
      within(panel).getByText('Priya could have made Bo win instead of Ada.'),
    ).toBeVisible()
    // The stored answer replaces the button entirely — that is the feature.
    expect(
      within(panel).queryByRole('button', { name: 'Run the search' }),
    ).not.toBeInTheDocument()
    expect(mocks.useStrategySearch).toHaveBeenCalledWith('e1', false)
  })

  it('falls back to the strategy button when nothing is precomputed', () => {
    renderRoutes('/election/e1/explore')
    const panel = screen.getByRole('region', { name: 'Strategic voting' })
    expect(
      within(panel).getByRole('button', { name: 'Run the search' }),
    ).toBeVisible()
  })

  it('renders a precomputed flip search with no button press (#146)', () => {
    mocks.useStoredSearches.mockReturnValue({
      data: {
        strategy: null,
        flip: {
        algorithms: [
          {
            algorithm: 'irv',
            distance_metric: 'irv_adjacent_transposition',
            baseline_winners: ['Ada'],
            best: 'bo',
            targets: [
              {
                candidate_id: 'bo',
                candidate_name: 'Bo',
                status: 'flipped',
                k: 1,
                proven: true,
                winners: ['Bo'],
                changes: [
                  {
                    voter_id: 'v1',
                    payload: { irv: ['bo', 'ada', 'cy'] },
                    distance: 1,
                  },
                ],
              },
            ],
          },
        ],
        tabulations_used: 5,
        budget: 400,
        budget_exhausted: false,
        },
      },
      isPending: false,
    })
    renderRoutes('/election/e1/explore')

    const panel = screen.getByRole('region', { name: 'Flip the outcome' })
    expect(within(panel).getByText('As voted, Ada wins IRV.')).toBeVisible()
    expect(
      within(panel).getByText(/Change 1 ballot and Bo wins IRV/),
    ).toBeVisible()
    // The stored answer replaces the button entirely — that is the feature.
    expect(
      within(panel).queryByRole('button', { name: 'Run the search' }),
    ).not.toBeInTheDocument()
    expect(mocks.useFlipSearch).toHaveBeenCalledWith('e1', false)
  })

  it('falls back to the button when nothing is precomputed', () => {
    renderRoutes('/election/e1/explore')
    const panel = screen.getByRole('region', { name: 'Flip the outcome' })
    expect(
      within(panel).getByRole('button', { name: 'Run the search' }),
    ).toBeVisible()
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
    // The strategic search has no algorithm requirement, so it stays (#149).
    expect(
      screen.getByRole('region', { name: 'Strategic voting' }),
    ).toBeInTheDocument()
  })

  it('opens an applied IRV suggestion exactly and preserves it across a STAR edit', async () => {
    // A combined real ballot derives IRV from STAR. A counterfactual replacement
    // must instead render both fields exactly as the scenario stores them.
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
    // The server suggestion rewrites only IRV and leaves STAR untouched.
    const suggested = {
      star: { ada: 5, bo: 3, cy: 1 },
      irv: ['cy', 'ada', 'bo'],
    }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .applySuggestion([{ voterId: 'v1', payload: suggested }])

    renderRoutes('/election/e1/explore/v1')

    // Opening the editor does not copy or rewrite the scenario.
    expect(
      screen.getByText(/part of the active suggestion/),
    ).toBeInTheDocument()
    expect(useCounterfactualStore.getState().edits.v1).toEqual(suggested)
    expect(useCounterfactualStore.getState().activeSuggestion).toEqual({
      v1: suggested,
    })

    // The full ledger labels the server-sourced chip.
    const ledger = screen.getByRole('region', { name: 'Your changes' })
    expect(within(ledger).getByText(/· suggested/)).toBeInTheDocument()

    // A STAR edit preserves the working IRV field, but the scenario is no
    // longer the exact suggestion and loses suggestion provenance globally.
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: 'Score for Cy' }),
      ).getByRole('radio', { name: '4' }),
    )
    expect(useCounterfactualStore.getState().activeSuggestion).toBeNull()
    expect(useCounterfactualStore.getState().edits.v1?.irv).toEqual([
      'cy',
      'ada',
      'bo',
    ])
  })

  it('renders a future STAR suggestion from the same authoritative payload path', () => {
    mocks.useElection.mockReturnValue({
      data: { ...election, algorithms: ['star', 'irv'] },
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
    const suggested = {
      star: { ada: 1, bo: 3, cy: 5 },
      irv: ['ada', 'bo', 'cy'],
    }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .applySuggestion([{ voterId: 'v1', payload: suggested }])

    renderRoutes('/election/e1/explore/v1')

    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Score for Ada' }),
      ).getByRole('radio', { name: '1' }),
    ).toBeChecked()
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Score for Cy' }),
      ).getByRole('radio', { name: '5' }),
    ).toBeChecked()
    const rankCard = screen
      .getByText('Rank the Candidates')
      .closest('[data-slot="card"]')
    expect(
      within(rankCard as HTMLElement)
        .getAllByText(/^(Ada|Bo|Cy)$/)
        .map((node) => node.textContent),
    ).toEqual(['Ada', 'Bo', 'Cy'])
    expect(useCounterfactualStore.getState().edits.v1).toEqual(suggested)
  })

  it('undoing the open ballot from the editor ledger removes the edit for good', async () => {
    // The editor has no private working copy that can resurrect a cleared edit.
    const user = userEvent.setup()
    const original = { irv: ['ada', 'bo', 'cy'] }
    useCounterfactualStore.getState().selectElection('e1')
    useCounterfactualStore
      .getState()
      .recordEdit('v1', original, { irv: ['cy', 'ada', 'bo'] })

    renderRoutes('/election/e1/explore/v1')

    await user.click(
      screen.getByRole('button', {
        name: "Undo the change to Priya's ballot",
      }),
    )
    expect(
      screen.getByRole('heading', { name: 'Explore what-ifs' }),
    ).toBeInTheDocument()
    expect(useCounterfactualStore.getState().edits).toEqual({})
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
