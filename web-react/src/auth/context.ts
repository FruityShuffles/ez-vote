import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

// The React replacement for the Flutter `authStateProvider`. Holds the live
// session so any consumer recomputes on sign-in / sign-out / token refresh
// (DET-02: owner controls must read live auth state, not a cached snapshot).
//
// Deliberately Supabase-free: `AuthProvider.tsx` owns the supabase subscription
// and feeds this context. Keeping the context/hook here lets guards and tests
// consume auth state without importing the Supabase client (and its env check).

export interface AuthContextValue {
  /** Current session, or null when signed out. */
  session: Session | null
  /** Convenience accessor for `session.user`. */
  user: User | null
  /** True until the initial `getSession()` resolves — gates guards from flashing. */
  loading: boolean
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
