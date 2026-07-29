import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ConsequenceRail,
  ConsequenceSummaryBar,
} from '@/components/counterfactual/ConsequenceRail'
import {
  describeOutcomeShift,
  joinNames,
  metricOf,
  type TabulationResult,
} from '@/lib/counterfactual'

// Tests for the consequence rail (M21). The rail is the feature's whole point —
// four methods reacting differently to one edit — so what's asserted here is the
// diff behaviour, not the styling: which strips report a change, what the
// outcome sentence says, and that the numbers carry their deltas.

function strip(algorithm: string): HTMLElement {
  const el = document.querySelector(`[data-algorithm="${algorithm}"]`)
  if (el == null) throw new Error(`No strip rendered for ${algorithm}`)
  return el as HTMLElement
}

const approval = (tallies: Record<string, number>, winners: string[]): TabulationResult => ({
  algorithm: 'approval',
  result_data: { tallies, winners, winner: winners[0] ?? null },
})

const irv = (
  firstPreferences: Record<string, number>,
  winners: string[],
  rounds = 1,
): TabulationResult => ({
  algorithm: 'irv',
  result_data: {
    winners,
    winner: winners[0] ?? null,
    rounds: [
      { counts: firstPreferences, eliminated: rounds > 1 ? ['Cy'] : null },
      ...Array.from({ length: rounds - 1 }, () => ({ counts: {}, eliminated: null })),
    ],
  },
})

describe('ConsequenceRail', () => {
  it('shows the plain result and no change markers before any edit', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        simulated={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{}}
        hasEdits={false}
      />,
    )

    expect(screen.getByText('The real result')).toBeInTheDocument()
    expect(screen.getByText('Winner: Ada')).toBeInTheDocument()
    expect(screen.queryByText('Unchanged')).not.toBeInTheDocument()
    expect(screen.queryByText('Changed')).not.toBeInTheDocument()
    // The "nothing is saved" reassurance is only meaningful once something has
    // been changed; before that it would be noise.
    expect(screen.queryByText(/Nothing here is saved/)).not.toBeInTheDocument()
  })

  it('marks only the methods the endpoint reported as changed', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 5, Bo: 4 }, ['Ada']), irv({ Ada: 3, Bo: 4 }, ['Bo'])]}
        simulated={[approval({ Ada: 5, Bo: 4 }, ['Ada']), irv({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{ approval: false, irv: true }}
        hasEdits
      />,
    )

    expect(within(strip('irv')).getByText('Changed')).toBeInTheDocument()
    expect(within(strip('approval')).getByText('Unchanged')).toBeInTheDocument()
    expect(strip('irv')).toHaveAttribute('data-changed', 'true')
    expect(strip('approval')).toHaveAttribute('data-changed', 'false')
    expect(screen.getByText(/Nothing here is saved/)).toBeInTheDocument()
  })

  it('states a flip in words rather than only badging it', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 3, Bo: 4 }, ['Bo'])]}
        simulated={[irv({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(screen.getByText('Ada wins instead of Bo')).toBeInTheDocument()
  })

  it('reports a win becoming a tie', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 5, Bo: 4 }, ['Ada'])]}
        simulated={[irv({ Ada: 4, Bo: 4 }, ['Ada', 'Bo'])]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(screen.getByText('Now a tie between Ada and Bo')).toBeInTheDocument()
  })

  it('reports a tie resolving to an outright win', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 4, Bo: 4 }, ['Ada', 'Bo'])]}
        simulated={[irv({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(screen.getByText('Ada now wins outright')).toBeInTheDocument()
  })

  it('renders deltas against the baseline, and none where nothing moved', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 3, Bo: 5, Cy: 2 }, ['Bo'])]}
        simulated={[irv({ Ada: 5, Bo: 3, Cy: 2 }, ['Ada'])]}
        changed={{ irv: true }}
        hasEdits
      />,
    )

    const rail = strip('irv')
    expect(within(rail).getByText('+2')).toBeInTheDocument()
    expect(within(rail).getByText('−2')).toBeInTheDocument()
    // Cy didn't move, so it carries a value but no delta.
    expect(within(rail).queryByText('+0')).not.toBeInTheDocument()
    expect(within(rail).queryByText('−0')).not.toBeInTheDocument()
  })

  it('sorts rows by the hypothetical standings, not the real ones', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 1, Bo: 9 }, ['Bo'])]}
        simulated={[approval({ Ada: 9, Bo: 1 }, ['Ada'])]}
        changed={{ approval: true }}
        hasEdits
      />,
    )
    const names = within(strip('approval'))
      .getAllByText(/^(Ada|Bo)$/)
      .map((el) => el.textContent)
    expect(names).toEqual(['Ada', 'Bo'])
  })

  it('calls out an IRV round-count change', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 3, Bo: 4 }, ['Bo'], 3)]}
        simulated={[irv({ Ada: 5, Bo: 4 }, ['Ada'], 2)]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(screen.getByText('3 rounds → 2')).toBeInTheDocument()
  })

  it('renders in canonical order regardless of input order', () => {
    render(
      <ConsequenceRail
        baseline={[
          { algorithm: 'fptp', result_data: { winners: ['Bo'], tallies: { Bo: 4 } } },
          irv({ Bo: 4 }, ['Bo']),
          approval({ Bo: 4 }, ['Bo']),
        ]}
        simulated={[
          { algorithm: 'fptp', result_data: { winners: ['Bo'], tallies: { Bo: 4 } } },
          irv({ Bo: 4 }, ['Bo']),
          approval({ Bo: 4 }, ['Bo']),
        ]}
        changed={{}}
        hasEdits={false}
      />,
    )
    const order = Array.from(document.querySelectorAll('[data-algorithm]')).map((el) =>
      el.getAttribute('data-algorithm'),
    )
    expect(order).toEqual(['approval', 'irv', 'fptp'])
  })

  it('falls back to the simulated side when an algorithm is missing from the baseline', () => {
    // Defensive: a mismatched pair must still render rather than throwing.
    render(
      <ConsequenceRail
        baseline={[]}
        simulated={[approval({ Ada: 5 }, ['Ada'])]}
        changed={{ approval: false }}
        hasEdits
      />,
    )
    expect(screen.getByText('Winner: Ada')).toBeInTheDocument()
  })

  it('shows the in-flight marker without hiding the previous numbers', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        simulated={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{}}
        hasEdits
        pending
      />,
    )
    expect(screen.getByRole('status', { name: 'Updating results' })).toBeInTheDocument()
    expect(screen.getByText('Winner: Ada')).toBeInTheDocument()
  })
})

describe('ConsequenceRail — explaining a flip with no visible movement', () => {
  // Re-ordering a voter's *lower* preferences flips IRV without shifting a
  // single first preference. Unexplained, the strip reads as a contradiction:
  // "Ada wins instead of Bo" above a bar chart where Bo still leads 4–3.
  const unmovedFirstPreferences = { Ada: 3, Bo: 4, Cy: 2 }

  it('names later-round transfers when IRV flips on identical first preferences', () => {
    render(
      <ConsequenceRail
        baseline={[irv(unmovedFirstPreferences, ['Bo'], 2)]}
        simulated={[irv(unmovedFirstPreferences, ['Ada'], 2)]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(
      screen.getByText('Same first preferences — the outcome moved on later-round transfers.'),
    ).toBeInTheDocument()
  })

  it('names the runoff when STAR flips on identical score totals', () => {
    const scores = { scores: { Ada: 25, Bo: 27 } }
    render(
      <ConsequenceRail
        baseline={[{ algorithm: 'star', result_data: { ...scores, winners: ['Bo'] } }]}
        simulated={[{ algorithm: 'star', result_data: { ...scores, winners: ['Ada'] } }]}
        changed={{ star: true }}
        hasEdits
      />,
    )
    expect(
      screen.getByText('Same score totals — the outcome moved in the runoff.'),
    ).toBeInTheDocument()
  })

  it('stays quiet when the numbers already show the movement', () => {
    render(
      <ConsequenceRail
        baseline={[irv({ Ada: 3, Bo: 4 }, ['Bo'])]}
        simulated={[irv({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{ irv: true }}
        hasEdits
      />,
    )
    expect(screen.queryByText(/Same first preferences/)).not.toBeInTheDocument()
  })

  it('says nothing for Approval, whose tallies are the outcome', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 4, Bo: 4 }, ['Ada', 'Bo'])]}
        simulated={[approval({ Ada: 4, Bo: 4 }, ['Ada'])]}
        changed={{ approval: true }}
        hasEdits
      />,
    )
    expect(screen.queryByText(/Same/)).not.toBeInTheDocument()
  })
})

describe('ConsequenceRail — compact variant', () => {
  it('keeps the outcome but drops the per-candidate numbers', () => {
    render(
      <ConsequenceRail
        baseline={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        simulated={[approval({ Ada: 5, Bo: 4 }, ['Ada'])]}
        changed={{}}
        hasEdits={false}
        variant="compact"
      />,
    )
    expect(screen.getByText('Winner: Ada')).toBeInTheDocument()
    expect(screen.queryByText('Approvals')).not.toBeInTheDocument()
    expect(screen.queryByText('reads your approvals')).not.toBeInTheDocument()
  })
})

describe('ConsequenceSummaryBar', () => {
  const props = {
    baseline: [approval({ Ada: 5, Bo: 4 }, ['Ada']), irv({ Ada: 3, Bo: 4 }, ['Bo'])],
    simulated: [approval({ Ada: 5, Bo: 4 }, ['Ada']), irv({ Ada: 3, Bo: 4 }, ['Ada'])],
    targetId: 'rail',
  }

  it('renders nothing before the first edit', () => {
    const { container } = render(
      <ConsequenceSummaryBar {...props} changed={{}} hasEdits={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the single method that moved, with what happened', () => {
    render(
      <ConsequenceSummaryBar {...props} changed={{ approval: false, irv: true }} hasEdits />,
    )
    expect(screen.getByText('IRV: Ada wins instead of Bo')).toBeInTheDocument()
  })

  it('counts and lists them when several move', () => {
    render(
      <ConsequenceSummaryBar {...props} changed={{ approval: true, irv: true }} hasEdits />,
    )
    expect(screen.getByText('2 methods change: Approval, IRV')).toBeInTheDocument()
  })

  it('reports plainly when an edit changed nothing', () => {
    render(
      <ConsequenceSummaryBar {...props} changed={{ approval: false, irv: false }} hasEdits />,
    )
    expect(screen.getByText('No method changed')).toBeInTheDocument()
  })
})

describe('describeOutcomeShift', () => {
  it('phrases each shape of change', () => {
    expect(describeOutcomeShift(['Ada'], ['Bo'])).toBe('Bo wins instead of Ada')
    expect(describeOutcomeShift(['Ada'], ['Ada', 'Bo'])).toBe('Now a tie between Ada and Bo')
    expect(describeOutcomeShift(['Ada', 'Bo'], ['Ada'])).toBe('Ada now wins outright')
    expect(describeOutcomeShift(['Ada', 'Bo'], ['Bo', 'Cy'])).toBe(
      'Now tied between Bo and Cy, was Ada and Bo',
    )
    expect(describeOutcomeShift([], ['Ada'])).toBe('Ada wins')
    expect(describeOutcomeShift(['Ada'], [])).toBe('No winner')
  })
})

describe('joinNames', () => {
  it('joins with a serial comma-free conjunction', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Ada'])).toBe('Ada')
    expect(joinNames(['Ada', 'Bo'])).toBe('Ada and Bo')
    expect(joinNames(['Ada', 'Bo', 'Cy'])).toBe('Ada, Bo and Cy')
  })
})

describe('metricOf', () => {
  it('reads the comparable numbers for each method', () => {
    expect(metricOf(approval({ Ada: 5 }, ['Ada']))).toEqual({ Ada: 5 })
    expect(
      metricOf({ algorithm: 'star', result_data: { scores: { Ada: 25 }, runoff: { Ada: 3 } } }),
    ).toEqual({ Ada: 25 })
  })

  it('uses IRV round 1, since later rounds hold a different candidate set', () => {
    expect(metricOf(irv({ Ada: 3, Bo: 4, Cy: 2 }, ['Bo'], 2))).toEqual({
      Ada: 3,
      Bo: 4,
      Cy: 2,
    })
  })

  it('returns nothing when the shape is absent', () => {
    expect(metricOf({ algorithm: 'irv', result_data: {} })).toEqual({})
  })
})
