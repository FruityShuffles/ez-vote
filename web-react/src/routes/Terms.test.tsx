import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Terms } from '@/routes/Terms'

describe('Terms', () => {
  it('renders the title, a known section, and the contact email', () => {
    render(
      <MemoryRouter>
        <Terms />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Terms of Service', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Limitation of Liability' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Contact us at contact@ez-vote\.org/)).toBeInTheDocument()
  })
})
