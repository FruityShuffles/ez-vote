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
  it('carries its own before and after strips', () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    const nia = within(row('Nia Sorensen'))
    expect(nia.getByText('was')).toBeInTheDocument()
    expect(nia.getByText('now')).toBeInTheDocument()
  })

  it('outlines only the candidates the change touched', () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    const now = within(row('Nia Sorensen')).getByLabelText(/^Changed to:/)
    const marked = Array.from(now.querySelectorAll('[data-changed="true"]'))
      .map((el) => el.textContent)
      .join(' ')

    // Ada and Bo swapped places; Cy held first and stays unmarked.
    expect(now.querySelectorAll('[data-changed="true"]')).toHaveLength(2)
    expect(marked).toContain('Ada')
    expect(marked).toContain('Bo')
    expect(marked).not.toContain('Cy')
  })

  it('marks nothing on the real ballot, only on the hypothetical one', () => {
    renderPicker({ edits: { v2: NIA_EDIT } })
    const was = within(row('Nia Sorensen')).getByLabelText(
      "Nia Sorensen's real ballot",
    )
    expect(was.querySelectorAll('[data-changed="true"]')).toHaveLength(0)
  })

  it('describes the change in text, since the outline alone is visual', () => {
    // The row deliberately shows no sentence — the strips make it obvious on
    // sight — so this label is the only description assistive tech gets.
    renderPicker({ edits: { v2: NIA_EDIT } })
    expect(
      within(row('Nia Sorensen')).getByLabelText(/Ada 3rd → 2nd/),
    ).toBeInTheDocument()
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
    const chip = screen.getByRole('button', { name: /^Ada,/, pressed: false })
    await userEvent.click(chip)
    expect(screen.queryByRole('button', { name: 'Nia Sorensen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Ada,/, pressed: true }))
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

describe('BallotPicker candidate chips (#133)', () => {
  // Bo leads on first preferences, Cy is nobody's — so the ranked order differs
  // from the election's own candidate order (Ada, Bo, Cy).
  const CONTESTED: FilterableBallot[] = [
    { voter_id: 'v1', display_name: 'Priya', payload: { irv: ['bo', 'ada', 'cy'], approval: ['bo'] } },
    { voter_id: 'v2', display_name: 'Nia', payload: { irv: ['bo', 'cy', 'ada'], approval: ['bo', 'cy'] } },
    { voter_id: 'v3', display_name: 'Sam', payload: { irv: ['ada', 'bo', 'cy'], approval: ['ada'] } },
  ]

  const chipNames = () =>
    within(screen.getByRole('group', { name: /^Show ballots/ }))
      .getAllByRole('button')
      .map((chip) => chip.getAttribute('aria-label'))

  it('ranks the chips by how many ballots each leads to', () => {
    renderPicker({ ballots: CONTESTED })
    expect(chipNames()).toEqual(['Bo, 2 ballots', 'Ada, 1 ballot', 'Cy, 0 ballots'])
  })

  it('re-ranks for the relation actually being filtered on', async () => {
    renderPicker({ ballots: CONTESTED })
    await userEvent.click(screen.getByRole('button', { name: 'Approved' }))
    // On approvals Cy is no longer a dead end (Bo 2, Ada 1, Cy 1), and the
    // Ada/Cy tie keeps the election's own candidate order.
    expect(chipNames()).toEqual(['Bo, 2 ballots', 'Ada, 1 ballot', 'Cy, 1 ballot'])
  })

  it('says in words what the chips do, and follows the relation toggle', async () => {
    renderPicker({ ballots: CONTESTED })
    expect(
      screen.getByText('Show ballots whose top choice was'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approved' }))
    expect(screen.getByText('Show ballots that approved')).toBeInTheDocument()
  })

  it('holds the counts steady while a name search narrows the list', async () => {
    renderPicker({ ballots: CONTESTED })
    await userEvent.type(screen.getByRole('searchbox'), 'sam')
    expect(chipNames()).toEqual(['Bo, 2 ballots', 'Ada, 1 ballot', 'Cy, 0 ballots'])
  })

  it('shows exactly the number of ballots a chip advertises', async () => {
    renderPicker({ ballots: CONTESTED })
    await userEvent.click(screen.getByRole('button', { name: 'Bo, 2 ballots' }))
    expect(screen.getByRole('button', { name: 'Priya' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sam' })).not.toBeInTheDocument()
  })
})
