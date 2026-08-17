import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StrategicVotingPanel } from '@/components/counterfactual/StrategicVotingPanel'
import type { Payload } from '@shared/derive'
import type { StrategicSearchResult } from '@shared/strategy'

// Tests for the strategic voting surface (#149). What matters: findings are
// grouped per method, the copy states only how the winner moved and never names
// a strategy, absence is not overclaimed, and "applied" is derived from the
// store rather than remembered locally.

const ORIGINALS = new Map<string, Payload>([
  ['v1', { irv: ['ada', 'bo', 'cy'], approval: ['ada'] }],
  ['v2', { irv: ['cy', 'bo', 'ada'], approval: ['cy', 'bo'] }],
])

const NAMES: Record<string, string> = { ada: 'Ada', bo: 'Bo', cy: 'Cy' }
const VOTERS: Record<string, string> = { v1: 'Priya Menon', v2: 'Nia Sorensen' }

const RESULT: StrategicSearchResult = {
  opportunities: [
    {
      algorithm: 'irv',
      voter_id: 'v2',
      payload: { irv: ['bo', 'cy', 'ada'], approval: ['cy', 'bo'] },
      baseline_winners: ['Ada'],
      winners: ['Bo'],
      shared_by: 3,
    },
    {
      algorithm: 'approval',
      voter_id: 'v1',
      payload: { irv: ['ada', 'bo', 'cy'], approval: [] },
      baseline_winners: ['Ada'],
      winners: ['Ada', 'Bo'],
      shared_by: 1,
    },
  ],
  algorithms_searched: ['approval', 'irv'],
  distinct_ballots: 4,
  ballots_examined: 9,
  tabulations_used: 60,
  budget: 300,
  budget_exhausted: false,
}

const EMPTY: StrategicSearchResult = {
  ...RESULT,
  opportunities: [],
}

function renderPanel(overrides: Partial<Parameters<typeof StrategicVotingPanel>[0]> = {}) {
  const onApply = vi.fn()
  const onSearch = vi.fn()
  render(
    <StrategicVotingPanel
      result={RESULT}
      pending={false}
      error={null}
      requested
      onSearch={onSearch}
      originals={ORIGINALS}
      nameOf={(id) => NAMES[id] ?? id}
      voterNameOf={(id) => VOTERS[id] ?? 'Unnamed voter'}
      edits={{}}
      activeSuggestion={null}
      onApply={onApply}
      {...overrides}
    />,
  )
  return { onApply, onSearch }
}

describe('StrategicVotingPanel', () => {
  it('groups findings by method and states only how the winner moved', () => {
    renderPanel()
    const panel = screen.getByRole('region', { name: 'Strategic voting' })

    expect(within(panel).getByText('Approval')).toBeVisible()
    expect(within(panel).getByText('IRV')).toBeVisible()
    expect(
      within(panel).getByText('Nia Sorensen could have made Bo win instead of Ada.'),
    ).toBeVisible()
    expect(
      within(panel).getByText(
        "Priya Menon could have turned Ada's win into a tie between Ada and Bo.",
      ),
    ).toBeVisible()

    // Rule 3: the output never names the strategy behind a finding.
    expect(panel.textContent).not.toMatch(
      /bullet vote|burial|bury|compromise|push-?over|tactical/i,
    )
  })

  it('spells the ballot change out and reports how many share it', () => {
    renderPanel()
    const panel = screen.getByRole('region', { name: 'Strategic voting' })

    expect(within(panel).getByText(/Bo 2nd → 1st/)).toBeVisible()
    expect(within(panel).getByText(/3 voters cast this ballot/)).toBeVisible()
    // shared_by 1 is the ordinary case and says nothing.
    expect(within(panel).queryByText(/1 voters cast/)).not.toBeInTheDocument()
  })

  it('names the isolation rule so a finding is not read as a whole-ballot claim', () => {
    renderPanel()
    expect(
      screen.getByText(/leaves the other methods exactly as voted/),
    ).toBeVisible()
  })

  it('applies one opportunity as the entire scenario', async () => {
    const user = userEvent.setup()
    const { onApply } = renderPanel()

    // Reached through its own row rather than by index, since the panel orders
    // groups by method (Approval before IRV) and not by the array it was given.
    const row = screen
      .getByText('Nia Sorensen could have made Bo win instead of Ada.')
      .closest('li') as HTMLElement
    await user.click(
      within(row).getByRole('button', { name: /Try this ballot/ }),
    )
    expect(onApply).toHaveBeenCalledWith([
      {
        voterId: 'v2',
        payload: { irv: ['bo', 'cy', 'ada'], approval: ['cy', 'bo'] },
      },
    ])
  })

  it('shows an applied opportunity as applied, derived from the store', () => {
    const payload = { irv: ['bo', 'cy', 'ada'], approval: ['cy', 'bo'] }
    renderPanel({ edits: { v2: payload }, activeSuggestion: { v2: payload } })

    expect(screen.getByText(/Applied — the change is in your ledger/)).toBeVisible()
    // The other finding is still offered; only the matching one flips.
    expect(
      screen.getAllByRole('button', { name: /Replace my changes with this/ }),
    ).toHaveLength(1)
  })

  it('does not claim the election is strategy-proof when it finds nothing', () => {
    renderPanel({ result: EMPTY })
    expect(
      screen.getByText(
        /No strategic voting opportunity found\. This search can't try every possible ballot, so one may still exist\./,
      ),
    ).toBeVisible()
  })

  it('offers the search only when there is no answer yet', async () => {
    const user = userEvent.setup()
    const { onSearch } = renderPanel({ result: undefined, requested: false })

    await user.click(screen.getByRole('button', { name: 'Run the search' }))
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('renders the cap explanation instead of a search when unavailable', () => {
    renderPanel({
      result: undefined,
      requested: false,
      unavailableReason: 'This election is too large (over 500 ballots).',
    })

    expect(
      screen.getByText('This election is too large (over 500 ballots).'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Run the search' }),
    ).not.toBeInTheDocument()
  })

  it('warns when the budget ran out, on both a full and an empty result', () => {
    const { rerender } = render(
      <StrategicVotingPanel
        result={{ ...RESULT, budget_exhausted: true }}
        pending={false}
        error={null}
        requested
        onSearch={vi.fn()}
        originals={ORIGINALS}
        nameOf={(id) => NAMES[id] ?? id}
        voterNameOf={(id) => VOTERS[id] ?? 'Unnamed voter'}
        edits={{}}
        activeSuggestion={null}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText(/there may be more to find/)).toBeVisible()

    rerender(
      <StrategicVotingPanel
        result={{ ...EMPTY, budget_exhausted: true }}
        pending={false}
        error={null}
        requested
        onSearch={vi.fn()}
        originals={ORIGINALS}
        nameOf={(id) => NAMES[id] ?? id}
        voterNameOf={(id) => VOTERS[id] ?? 'Unnamed voter'}
        edits={{}}
        activeSuggestion={null}
        onApply={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/hit its compute budget before finishing/),
    ).toBeVisible()
  })
})
