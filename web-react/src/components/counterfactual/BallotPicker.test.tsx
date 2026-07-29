import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BallotPicker } from '@/components/counterfactual/BallotPicker'
import type { Candidate } from '@/lib/elections'
import type { FilterableBallot } from '@/lib/counterfactualFilter'

// Tests for screen 1 of the what-if explorer (M21). What matters here is that a
// row carries enough of the ballot to choose from, and that a changed row owns
// its own diff and undo rather than deferring to a ledger elsewhere.

const CANDIDATES: Candidate[] = [
  { id: 'ada', election_id: 'e', name: 'Ada', position: 0, created_at: '' },
  { id: 'bo', election_id: 'e', name: 'Bo', position: 1, created_at: '' },
  { id: 'cy', election_id: 'e', name: 'Cy', position: 2, created_at: '' },
]

const BALLOTS: FilterableBallot[] = [
  {
    voter_id: 'v1',
    display_name: 'Priya Menon',
    payload: { star: { ada: 5, bo: 1, cy: 0 }, irv: ['ada', 'bo', 'cy'], approval: ['ada'] },
  },
  {
    voter_id: 'v2',
    display_name: 'Nia Sorensen',
    payload: { star: { cy: 5, ada: 3, bo: 3 }, irv: ['cy', 'bo', 'ada'], approval: ['cy'] },
  },
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof BallotPicker>> = {}) {
  const props = {
    ballots: BALLOTS,
    candidates: CANDIDATES,
    edits: {},
    onSelect: vi.fn(),
    onUndo: vi.fn(),
    ...overrides,
  }
  render(<BallotPicker {...props} />)
  return props
}

/** The list item for a voter, so assertions stay scoped to one row. */
function row(name: string): HTMLElement {
  const heading = screen.getByRole('button', { name })
  const li = heading.closest('li')
  if (li == null) throw new Error(`No row for ${name}`)
  return li
}

const NIA_EDIT = {
  original: BALLOTS[1].payload,
  payload: { star: { cy: 5, ada: 3, bo: 3 }, irv: ['cy', 'ada', 'bo'], approval: ['cy'] },
}

describe('BallotPicker rows', () => {
  it('shows the whole ballot in the voter\'s own order, not just a top choice', () => {
    renderPicker()
    const priya = within(row('Priya Menon'))
    expect(priya.getByText('Ada')).toBeInTheDocument()
    expect(priya.getByText('Bo')).toBeInTheDocument()
    expect(priya.getByText('Cy')).toBeInTheDocument()
    expect(priya.getByText('5')).toBeInTheDocument()
  })

  it('explains what the strip encodes', () => {
    renderPicker()
    expect(
      screen.getByText("In each voter's own order · filled = approved · number = score"),
    ).toBeInTheDocument()
  })

  it('omits legend clauses the ballots cannot support', () => {
    // Approval-only ballots have no order and no scores to explain.
    renderPicker({
      ballots: [{ voter_id: 'v1', display_name: 'Priya', payload: { approval: ['ada'] } }],
    })
    expect(screen.getByText('filled = approved')).toBeInTheDocument()
    expect(screen.queryByText(/number = score/)).not.toBeInTheDocument()
    expect(screen.queryByText(/own order/)).not.toBeInTheDocument()
  })

  it('opens a ballot when its row is clicked', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Nia Sorensen' }))
    expect(onSelect).toHaveBeenCalledWith('v2')
  })
})

describe('BallotPicker rows — a changed ballot', () => {
  it('carries its own before/after and what moved', () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    const nia = within(row('Nia Sorensen'))
    expect(nia.getByText('was')).toBeInTheDocument()
    expect(nia.getByText('now')).toBeInTheDocument()
    expect(nia.getByText(/Ada 3rd → 2nd/)).toBeInTheDocument()
  })

  it('offers undo on the row itself', async () => {
    const { onUndo } = renderPicker({ edits: { v2: NIA_EDIT } })
    await userEvent.click(
      screen.getByRole('button', { name: "Undo the change to Nia Sorensen's ballot" }),
    )
    expect(onUndo).toHaveBeenCalledWith('v2')
  })

  it('leaves untouched rows without a diff or an undo', () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    const priya = within(row('Priya Menon'))
    expect(priya.queryByText('was')).not.toBeInTheDocument()
    expect(priya.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
  })

  it('keeps undo reachable as its own control, not nested in the row button', () => {
    // A button inside a button is invalid and unreachable by keyboard.
    renderPicker({ edits: { v2: NIA_EDIT } })
    const undo = screen.getByRole('button', {
      name: "Undo the change to Nia Sorensen's ballot",
    })
    expect(undo.closest('button:not([aria-label])')).toBeNull()
  })
})

describe('BallotPicker filters', () => {
  it('matches voters by name', async () => {
    renderPicker()
    await userEvent.type(screen.getByRole('searchbox'), 'nia')
    expect(screen.queryByRole('button', { name: 'Priya Menon' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nia Sorensen' })).toBeInTheDocument()
  })

  it('filters by candidate and clears when the chip is pressed again', async () => {
    renderPicker()
    const chip = screen.getByRole('button', { name: 'Ada', pressed: false })
    await userEvent.click(chip)
    expect(screen.queryByRole('button', { name: 'Nia Sorensen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ada', pressed: true }))
    expect(screen.getByRole('button', { name: 'Nia Sorensen' })).toBeInTheDocument()
  })

  it('offers a changed-only filter only once something has changed', () => {
    renderPicker()
    expect(screen.queryByRole('button', { name: /^Changed/ })).not.toBeInTheDocument()
  })

  it('isolates the changed ballots on request', async () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    await userEvent.click(screen.getByRole('button', { name: 'Changed (1)' }))
    expect(screen.getByRole('button', { name: 'Nia Sorensen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Priya Menon' })).not.toBeInTheDocument()
  })

  it('reports an empty result rather than an empty list', async () => {
    renderPicker()
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('No ballots match this filter.')).toBeInTheDocument()
  })
})
