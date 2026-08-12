import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/context'
import { safeRedirect, withRedirect } from '@/auth/redirect'

// Route guards reproducing the GoRouter `redirect` callback in `router.dart`.
//
// Post-auth navigation is intentionally guard-driven rather than a manual
// navigate() inside the screens: the context session updates asynchronously via
// onAuthStateChange, so navigating right after `await signIn()` would race a
// RequireAuth guard that hasn't seen the new session yet. Instead the auth
// screens stay put and RedirectIfAuthed reacts to the session change — a single
// source of truth for redirect resolution (AUTH-01).

function AuthLoading() {
  // Brief placeholder while the initial getSession() resolves, so guards don't
  // flash a redirect before auth state is known.
  return (
    <div className="grid min-h-svh place-items-center text-muted-foreground">
      Loading…
    </div>
  )
}

/** Wrap protected routes. Unauthenticated users go to /login?redirect=<here>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, isGuest } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (!session && !isGuest) {
    const here = location.pathname + location.search + location.hash
    return <Navigate to={withRedirect('/login', here)} replace />
  }
  return <>{children}</>
}

/** Wrap routes that mutate account-owned data. Guests are sent to signup and
 *  return to the requested route after creating an account. */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { session, loading, isGuest } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (session) return <>{children}</>

  const here = location.pathname + location.search + location.hash
  return (
    <Navigate to={withRedirect(isGuest ? '/signup' : '/login', here)} replace />
  )
}

/** Wrap auth routes (/login, /signup, /forgot-password). Authenticated users are
 *  sent to the `redirect=` destination, or /dashboard. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()

  if (loading) return <AuthLoading />
  if (session)
    return <Navigate to={safeRedirect(params.get('redirect'))} replace />
  return <>{children}</>
}
