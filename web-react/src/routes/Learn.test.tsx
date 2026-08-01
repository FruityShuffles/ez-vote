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
