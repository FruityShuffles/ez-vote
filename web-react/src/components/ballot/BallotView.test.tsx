import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Candidate } from '@/lib/elections'
import { useBallotState } from '@/lib/useBallotState'
import { BallotView } from '@/components/ballot/BallotView'

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

function Harness({
  algorithms,
  includeFptp = false,
  viewOnly = false,
}: {
  algorithms: string[]
  includeFptp?: boolean
  viewOnly?: boolean
}) {
  const ballot = useBallotState({
    candidates: CANDIDATES,
    algorithms,
    includeFptp,
    existingPayload: null,
  })
  return (
    <BallotView
      ballot={ballot}
      candidates={CANDIDATES}
      includeFptp={includeFptp}
      viewOnly={viewOnly}
      zeroApprovalFlash={false}
    />
  )
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
