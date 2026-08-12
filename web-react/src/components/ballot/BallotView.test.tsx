import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  baselineMarks,
  buildBaseline,
  NO_BASELINE_MARKS,
} from '@/lib/ballotBaseline'
import { canonicalPayload } from '@/lib/ballotState'
import type { Candidate } from '@/lib/elections'
import { useBallotState } from '@/lib/useBallotState'
import { BallotView } from '@/components/ballot/BallotView'
import type { Payload } from '@shared/derive'

// Render-level checks for the ballot UI: correct inputs per template and that
// view-only mode disables everything (BAL-16). Templates without drag-and-drop
// (B/C) keep these stable under jsdom; the reorder logic itself is covered by
// ballotState.test.ts / derive.test.ts.

function candidate(id: string, name: string, position: number): Candidate {
  return {
    id,
    name,
    position,
    election_id: 'e1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

const CANDIDATES = [
  candidate('a', 'Alice', 0),
  candidate('b', 'Bob', 1),
]

const CANDIDATE_IDS = CANDIDATES.map((c) => c.id)

function Harness({
  algorithms,
  includeFptp = false,
  viewOnly = false,
  castPayload = null,
}: {
  algorithms: string[]
  includeFptp?: boolean
  viewOnly?: boolean
  /** The ballot as submitted — drives the baseline marks (#137). */
  castPayload?: Payload | null
}) {
  const ballot = useBallotState({
    candidates: CANDIDATES,
    algorithms,
    includeFptp,
    existingPayload: castPayload,
  })
  const marks =
    castPayload == null
      ? NO_BASELINE_MARKS
      : baselineMarks(
          buildBaseline(
            canonicalPayload(castPayload, algorithms, CANDIDATE_IDS, includeFptp),
            CANDIDATE_IDS,
            algorithms,
          ),
          ballot.state,
          ballot.template,
          CANDIDATE_IDS,
          includeFptp,
        )
  return (
    <BallotView
      ballot={ballot}
      candidates={CANDIDATES}
      includeFptp={includeFptp}
      viewOnly={viewOnly}
      zeroApprovalFlash={false}
      marks={marks}
    />
  )
}

/** Every control currently carrying a baseline mark. */
function marked() {
  return document.querySelectorAll('[data-baseline="true"]')
}

describe('BallotView dispatch + rendering', () => {
  it('renders STAR score chips for template B', () => {
    render(<Harness algorithms={['star']} />)
    expect(screen.getByText('Rate Each Candidate')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // 6 chips (0–5) per candidate × 2 candidates
    expect(screen.getAllByRole('radio')).toHaveLength(12)
  })

  it('renders approval checkboxes for template C and toggles them', async () => {
    const user = userEvent.setup()
    render(<Harness algorithms={['approval']} />)
    const alice = screen.getByRole('checkbox', { name: 'Alice' })
    expect(alice).not.toBeChecked()
    await user.click(alice)
    expect(alice).toBeChecked()
  })

  it('disables inputs in view-only mode (BAL-16)', () => {
    render(<Harness algorithms={['star']} viewOnly />)
    for (const chip of screen.getAllByRole('radio')) {
      expect(chip).toBeDisabled()
    }
  })

  it('shows the score-sorted ranked card for template F', () => {
    render(<Harness algorithms={['star', 'irv']} />)
    expect(screen.getByText('Score the Candidates')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})

// The marks are a diff: reopening a ballot shows none, and each one appears on
// the control that held the value the voter actually cast (#137). The rules
// deciding *which* controls are marked live in ballotBaseline.test.ts; these
// check that the marks reach the screen and say so out loud.
describe('baseline marks', () => {
  it('marks nothing when a cast ballot is reopened untouched', () => {
    render(
      <Harness algorithms={['star']} castPayload={{ star: { a: 4, b: 1 } }} />,
    )
    expect(marked()).toHaveLength(0)
  })

  it('marks nothing on a first vote, where there is no cast ballot', async () => {
    const user = userEvent.setup()
    render(<Harness algorithms={['star']} />)
    await user.click(screen.getAllByRole('radio', { name: '5' })[0])
    expect(marked()).toHaveLength(0)
  })

  it('template B: outlines the chip holding the original score', async () => {
    const user = userEvent.setup()
    render(
      <Harness algorithms={['star']} castPayload={{ star: { a: 4, b: 1 } }} />,
    )
    await user.click(screen.getAllByRole('radio', { name: '5' })[0])

    const chip = screen.getByRole('radio', { name: '4, your original score' })
    expect(chip).toHaveAttribute('data-baseline', 'true')
    expect(chip).not.toBeChecked()
    expect(marked()).toHaveLength(1)
  })

  it('template C: marks a toggled checkbox and says which way it was', async () => {
    const user = userEvent.setup()
    render(<Harness algorithms={['approval']} castPayload={{ approval: ['a'] }} />)

    await user.click(screen.getByRole('checkbox', { name: /^Alice/ }))
    expect(
      screen.getByRole('checkbox', { name: /Alice\s*\(was approved\)/ }),
    ).toHaveAttribute('data-baseline', 'true')

    await user.click(screen.getByRole('checkbox', { name: /^Bob/ }))
    expect(
      screen.getByRole('checkbox', { name: /Bob\s*\(was not approved\)/ }),
    ).toBeInTheDocument()
    expect(marked()).toHaveLength(2)
  })

  it('template D: marks the stepper, not the rows its cutoff approves', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        algorithms={['irv', 'approval']}
        castPayload={{ irv: ['a', 'b'], approval: ['a'] }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Increase number to approve' }))

    expect(screen.getByText('was 1')).toBeInTheDocument()
    expect(marked()).toHaveLength(1)
  })

  it('template F: a score change marks the chip and leaves the order alone', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        algorithms={['star', 'irv']}
        castPayload={{ star: { a: 5, b: 2 }, irv: ['a', 'b'] }}
      />,
    )
    // Drop Alice below Bob by scoring her 0 — Bob moves up as a consequence.
    await user.click(screen.getAllByRole('radio', { name: '0' })[0])

    expect(
      screen.getByRole('radio', { name: '5, your original score' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^was \d/)).not.toBeInTheDocument()
    expect(marked()).toHaveLength(1)
  })
})
