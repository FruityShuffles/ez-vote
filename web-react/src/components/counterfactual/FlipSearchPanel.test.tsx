import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FlipSearchPanel } from '@/components/counterfactual/FlipSearchPanel'
import type { Payload } from '@shared/derive'
import type { FlipSearchResult } from '@shared/flip'

// Tests for the flip-search surface (#135). What matters: the search is
// user-initiated, the copy keeps the server's honesty contract, the cheapest
// answer is visually singled out, and "applied" is derived from the store
// rather than remembered locally.

const ORIGINALS = new Map<string, Payload>([
  ['v1', { irv: ['ada', 'bo', 'cy'] }],
  ['v2', { irv: ['ada', 'cy', 'bo'] }],
])

const NAMES: Record<string, string> = { ada: 'Ada', bo: 'Bo', cy: 'Cy' }
const VOTERS: Record<string, string> = { v1: 'Priya Menon', v2: 'Nia Sorensen' }

const RESULT: FlipSearchResult = {
  algorithms: [
    {
      algorithm: 'irv',
      distance_metric: 'irv_adjacent_transposition',
      baseline_winners: ['Ada'],
      best: 'bo',
      targets: [
        {
          candidate_id: 'cy',
          candidate_name: 'Cy',
          status: 'flipped',
          k: 2,
          proven: false,
          winners: ['Ada', 'Cy'],
          changes: [
            {
              voter_id: 'v1',
              payload: { irv: ['cy', 'ada', 'bo'] },
              distance: 2,
            },
            {
              voter_id: 'v2',
              payload: { irv: ['cy', 'ada', 'bo'] },
              distance: 1,
            },
          ],
        },
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
  tabulations_used: 12,
  budget: 400,
  budget_exhausted: false,
}

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof FlipSearchPanel>> = {},
) {
  const props = {
    result: undefined,
    pending: false,
    error: null,
    requested: false,
    onSearch: vi.fn(),
    originals: ORIGINALS,
    nameOf: (id: string) => NAMES[id] ?? 'Removed candidate',
    voterNameOf: (id: string) => VOTERS[id] ?? 'A voter',
    edits: {},
    activeSuggestion: null,
    onApply: vi.fn(),
    ...overrides,
  }
  render(<FlipSearchPanel {...props} />)
  return props
}

describe('FlipSearchPanel', () => {
  it('starts idle and only searches when asked', async () => {
    const user = userEvent.setup()
    const props = renderPanel()

    expect(props.onSearch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Run the search' }))
    expect(props.onSearch).toHaveBeenCalledOnce()
  })

  it('drops the button and the idle hint once a result is present (#146)', () => {
    // A precomputed answer arrives with `requested: false` — the user never
    // pressed anything — so neither the button nor the "Searches for the
    // smallest ballot changes…" hint may render beside it.
    renderPanel({ result: RESULT, requested: false })

    expect(
      screen.queryByRole('button', { name: 'Run the search' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Searches for the smallest ballot changes/),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/^As voted, /)).toBeInTheDocument()
  })

  it('explains unavailability instead of offering the search', () => {
    renderPanel({
      unavailableReason:
        'This election is too large for the flip search (over 500 ballots).',
    })
    expect(
      screen.queryByRole('button', { name: 'Run the search' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/too large for the flip search/),
    ).toBeInTheDocument()
  })

  it('orders answers cheapest-first and highlights the best target', () => {
    renderPanel({ result: RESULT, requested: true })

    const rows = screen.getAllByRole('listitem')
    // Bo (k=1) sorts above Cy (k=2) even though the server listed Cy first.
    expect(rows[0]).toHaveTextContent('Bo wins IRV')
    expect(within(rows[0]).getByText('Cheapest found')).toBeInTheDocument()
    expect(rows[0].className).toContain('ring-primary')

    // The k=2 tie keeps the honesty phrasing: best found, ties — not wins.
    const cyRow = rows.find((row) => row.textContent?.includes('Cy ties'))
    expect(cyRow).toHaveTextContent(
      'Best found: change 2 ballots and Cy ties for the IRV win with Ada. A smaller set may exist.',
    )
  })

  it('renders changes as read-only ledger-shaped chips with distances', () => {
    renderPanel({ result: RESULT, requested: true })

    const rows = screen.getAllByRole('listitem')
    const cyRow = rows.find((row) => row.textContent?.includes('Cy ties'))
    // First phrase, remainder count, then the distance in metric units.
    expect(cyRow).toHaveTextContent(
      'Priya Menon · Cy 3rd → 1st +2 more · 2 swaps',
    )
    expect(cyRow).toHaveTextContent(
      'Nia Sorensen · Cy 2nd → 1st +1 more · 1 swap',
    )
    // Read-only: no undo buttons on suggestion chips.
    expect(
      screen.queryByRole('button', { name: /Undo the change/ }),
    ).not.toBeInTheDocument()
  })

  it('applies a change set and labels the button as replacement when edits exist', async () => {
    const user = userEvent.setup()
    const props = renderPanel({ result: RESULT, requested: true })

    await user.click(
      screen.getAllByRole('button', { name: 'Try these changes' })[0],
    )
    expect(props.onApply).toHaveBeenCalledWith([
      { voterId: 'v1', payload: { irv: ['bo', 'ada', 'cy'] } },
    ])
  })

  it('warns that pending edits are not part of the answer, and labels apply as replace', () => {
    renderPanel({
      result: RESULT,
      requested: true,
      edits: { v9: { irv: ['cy', 'ada', 'bo'] } },
    })
    expect(
      screen.getByText(/your current what-ifs are not included/),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Replace my changes with these' }),
    ).not.toHaveLength(0)
  })

  it('derives the applied state from the store markers', () => {
    renderPanel({
      result: RESULT,
      requested: true,
      edits: { v1: { irv: ['bo', 'ada', 'cy'] } },
      activeSuggestion: { v1: { irv: ['bo', 'ada', 'cy'] } },
    })
    // Bo's exact change set is the ledger: applied, no button.
    expect(screen.getByText(/^Applied —/)).toBeInTheDocument()
    // Cy's set is not the ledger, so it still offers replacement.
    expect(
      screen.getByRole('button', { name: 'Replace my changes with these' }),
    ).toBeInTheDocument()
  })

  it('notes when the search hit its budget', () => {
    renderPanel({
      result: { ...RESULT, budget_exhausted: true },
      requested: true,
    })
    expect(screen.getByText(/hit its compute budget/)).toBeInTheDocument()
  })

  it('states the baseline in the right number: one winner wins, several tie', () => {
    renderPanel({ result: RESULT, requested: true })
    expect(screen.getByText('As voted, Ada wins IRV.')).toBeInTheDocument()
  })

  it('calls a tied baseline a tie', () => {
    const tied = structuredClone(RESULT)
    tied.algorithms[0].baseline_winners = ['Bo', 'Cy']
    renderPanel({ result: tied, requested: true })
    expect(
      screen.getByText('As voted, Bo and Cy tie for the IRV win.'),
    ).toBeInTheDocument()
  })

  it('surfaces errors and keeps the search offerable', () => {
    renderPanel({
      error: new Error('too many ballots for flip search (max 500)'),
      requested: true,
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'too many ballots for flip search (max 500)',
    )
    expect(
      screen.getByRole('button', { name: 'Run the search' }),
    ).toBeInTheDocument()
  })
})
