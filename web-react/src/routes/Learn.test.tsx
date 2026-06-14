import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Learn } from '@/routes/Learn'

function renderLearn() {
  return render(
    <MemoryRouter>
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
