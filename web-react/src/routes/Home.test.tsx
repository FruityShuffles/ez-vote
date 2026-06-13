import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from '@/routes/Home'

// Smoke test for the M5 scaffold: confirms the React render path works and the
// owned shadcn Button (Base UI primitive) mounts. Expands into real assertions
// as surfaces are ported.
describe('Home', () => {
  it('renders the heading and the shadcn button', () => {
    render(<Home />)
    expect(
      screen.getByRole('heading', { name: 'EZVote', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'It works' })).toBeInTheDocument()
  })
})
