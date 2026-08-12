import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/auth/context'
import { Home } from '@/routes/Home'

const LOGGED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  isGuest: false,
  continueAsGuest: () => undefined,
}
const LOGGED_IN: AuthContextValue = {
  session: { user: { id: 'u1' } } as Session,
  user: { id: 'u1' } as Session['user'],
  loading: false,
  isGuest: false,
  continueAsGuest: () => undefined,
}
const GUEST: AuthContextValue = { ...LOGGED_OUT, isGuest: true }

function renderHome(auth: AuthContextValue, ui: ReactNode = <Home />) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('Home (landing)', () => {
  it('renders the brand, tagline, and the three feature bullets', () => {
    renderHome(LOGGED_OUT)
    expect(
      screen.getByRole('heading', { name: 'EZVote', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Run fair, transparent elections with modern voting methods.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/Approval Voting/)).toBeInTheDocument()
    expect(screen.getByText(/Instant Runoff \(IRV\)/)).toBeInTheDocument()
    expect(screen.getByText(/STAR Voting/)).toBeInTheDocument()
  })

  it('shows Get Started / Sign In when signed out', () => {
    renderHome(LOGGED_OUT)
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/signup',
    )
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(
      screen.getByRole('button', { name: 'Continue as guest' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Go to Dashboard' }),
    ).not.toBeInTheDocument()
  })

  it('shows Go to Dashboard when signed in', () => {
    renderHome(LOGGED_IN)
    expect(
      screen.getByRole('link', { name: 'Go to Dashboard' }),
    ).toHaveAttribute('href', '/dashboard')
    expect(
      screen.queryByRole('link', { name: 'Get Started' }),
    ).not.toBeInTheDocument()
  })

  it('shows Go to Dashboard when guest mode is already active', () => {
    renderHome(GUEST)
    expect(
      screen.getByRole('link', { name: 'Go to Dashboard' }),
    ).toHaveAttribute('href', '/dashboard')
    expect(
      screen.queryByRole('button', { name: 'Continue as guest' }),
    ).not.toBeInTheDocument()
  })

  it('activates guest mode from the landing page', async () => {
    const user = userEvent.setup()
    let continued = false
    renderHome({
      ...LOGGED_OUT,
      continueAsGuest: () => {
        continued = true
      },
    })

    await user.click(screen.getByRole('button', { name: 'Continue as guest' }))
    expect(continued).toBe(true)
  })
})
