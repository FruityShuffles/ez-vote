import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Privacy } from '@/routes/Privacy'

describe('Privacy', () => {
  it('renders the title, a known section, and the contact email', () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Privacy Policy', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Data Retention' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/contact@ez-vote\.org/).length).toBeGreaterThan(0)
  })
})
