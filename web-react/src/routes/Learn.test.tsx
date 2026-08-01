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

  it('closes with a bottom line framing FPTP as a comparison baseline', () => {
    renderLearn('/learn?algo=fptp')
    expect(
      screen.getByRole('heading', { name: 'The Bottom Line' }),
    ).toBeVisible()
    expect(
      screen.getByText(/baseline to measure against, not as a method worth/),
    ).toBeVisible()
  })

  it('gives no bottom line to the methods EZVote actually recommends', async () => {
    const user = userEvent.setup()
    renderLearn('/learn?algo=fptp')
    await user.click(screen.getByRole('tab', { name: 'Approval' }))
    expect(
      screen.getByRole('heading', { name: 'Approval Voting' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'The Bottom Line' }),
    ).toBeNull()
  })
})
