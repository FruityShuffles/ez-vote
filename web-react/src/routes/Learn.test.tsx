import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Learn, LearnContent } from '@/routes/Learn'

function renderLearn(path = '/learn') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Learn />
    </MemoryRouter>,
  )
}

describe('Learn', () => {
  it('shows the Approval algorithm by default', () => {
    renderLearn()
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Simple to count')).toBeInTheDocument()
  })

  it('swaps to the STAR algorithm when the STAR tab is selected', async () => {
    const user = userEvent.setup()
    renderLearn()
    await user.click(screen.getByRole('tab', { name: 'STAR' }))
    expect(
      screen.getByRole('heading', { name: 'STAR Voting' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Captures preference intensity'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Approval Voting' }),
    ).not.toBeInTheDocument()
  })
})

describe('#112 FPTP tab and deep linking', () => {
  it('opens the FPTP tab when linked to with ?algo=fptp', () => {
    renderLearn('/learn?algo=fptp')
    expect(screen.getByRole('tab', { name: 'FPTP' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('heading', { name: 'First Past the Post (FPTP)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Vote-splitting decides elections')).toBeVisible()
  })

  it('falls back to Approval when ?algo= is not a method we cover', () => {
    renderLearn('/learn?algo=borda')
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
  })

  it('still self-manages the tab when embedded without props', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LearnContent />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'FPTP' }))
    expect(
      screen.getByRole('heading', { name: 'First Past the Post (FPTP)' }),
    ).toBeInTheDocument()
  })
})

describe('#129 FPTP reads as the baseline, not a fourth option', () => {
  it('offers familiarity as the only strength', () => {
    renderLearn('/learn?algo=fptp')
    expect(screen.getByText('Everyone already knows it')).toBeVisible()
    // Demoted: approval voting counts and settles just as easily, so neither
    // was ever an advantage of FPTP over the methods it sits beside.
    expect(screen.queryByText('Trivial to count and audit')).toBeNull()
    expect(screen.queryByText('Produces a decisive result')).toBeNull()
  })

  it('names the costs plurality rules impose on the ballot itself', () => {
    renderLearn('/learn?algo=fptp')
    expect(
      screen.getByText('It narrows the field before voting even starts'),
    ).toBeVisible()
    expect(
      screen.getByText('It throws away everything but your first choice'),
    ).toBeVisible()
  })

  it('closes with a verdict on what a one-mark ballot costs the voter', () => {
    renderLearn('/learn?algo=fptp')
    expect(screen.getByRole('heading', { name: 'The Verdict' })).toBeVisible()
    expect(
      screen.getByText(/give up on choosing their favorite/),
    ).toBeVisible()
  })

  it('gives no verdict to the methods EZVote actually recommends', async () => {
    const user = userEvent.setup()
    renderLearn('/learn?algo=fptp')
    await user.click(screen.getByRole('tab', { name: 'Approval' }))
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The Verdict' })).toBeNull()
  })

  // The summary and verdict are the first and last things read, so they are the
  // two places a product aside does the most damage — and the old copy spent
  // both on one. Neither may name EZVote, and neither may reach for the jargon
  // ("plurality", "majority rule") a layman would stumble over.
  it('keeps the summary and verdict about voting, in plain words', () => {
    renderLearn('/learn?algo=fptp')
    const summary = screen.getByText(/^First past the post is the pick-one/)
    const verdict = screen.getByText(/^First past the post lets you choose one/)
    for (const copy of [summary, verdict]) {
      expect(copy.textContent).not.toMatch(/EZVote/)
      expect(copy.textContent).not.toMatch(/plurality|majority rule/i)
    }
  })
})
