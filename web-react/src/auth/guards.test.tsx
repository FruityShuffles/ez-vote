import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/auth/context'
import { RedirectIfAuthed, RequireAuth } from '@/auth/guards'

// Renders the active path+search so we can assert where a guard navigated.
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderAt(path: string, auth: AuthContextValue, ui: ReactNode) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LocationProbe />} />
          <Route path="/dashboard" element={<LocationProbe />} />
          <Route path="/election/:id/vote" element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const LOGGED_OUT: AuthContextValue = { session: null, user: null, loading: false }
const LOGGED_IN: AuthContextValue = {
  session: { user: { id: 'u1' } } as Session,
  user: { id: 'u1' } as Session['user'],
  loading: false,
}

describe('RequireAuth', () => {
  it('redirects an unauthenticated user to /login carrying the encoded redirect (AUTH-01)', () => {
    renderAt(
      '/election/abc/vote',
      LOGGED_OUT,
      <RequireAuth>
        <div>ballot</div>
      </RequireAuth>,
    )
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/login?redirect=%2Felection%2Fabc%2Fvote',
    )
  })

  it('renders the protected content when authenticated', () => {
    renderAt(
      '/election/abc/vote',
      LOGGED_IN,
      <RequireAuth>
        <div>ballot</div>
      </RequireAuth>,
    )
    expect(screen.getByText('ballot')).toBeInTheDocument()
  })
})

describe('RedirectIfAuthed', () => {
  it('sends an authenticated user from /login to the decoded redirect destination (AUTH-01)', () => {
    render(
      <AuthContext.Provider value={LOGGED_IN}>
        <MemoryRouter initialEntries={['/login?redirect=%2Felection%2Fabc%2Fvote']}>
          <Routes>
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <div>login form</div>
                </RedirectIfAuthed>
              }
            />
            <Route path="/election/:id/vote" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByTestId('loc')).toHaveTextContent('/election/abc/vote')
  })

  it('renders the auth screen when unauthenticated', () => {
    render(
      <AuthContext.Provider value={LOGGED_OUT}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <div>login form</div>
                </RedirectIfAuthed>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByText('login form')).toBeInTheDocument()
  })
})
