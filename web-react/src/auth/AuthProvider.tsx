import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue } from '@/auth/context'

// Tracks the Supabase session and publishes it through AuthContext. Seeds from
// getSession() (covers a persisted session restored on page load — session
// persistence) then subscribes to onAuthStateChange so sign-in, sign-out, and
// token refresh propagate live to every consumer.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  // Last user id we published, to detect a genuine account change. `undefined`
  // means "no session applied yet" (distinct from a signed-out `null`).
  const lastUserIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let active = true

    function applySession(next: Session | null) {
      if (!active) return
      const nextUserId = next?.user?.id ?? null
      // On a real account change — sign-out, sign-in, or switching accounts
      // without a page reload — drop all cached server state. The QueryClient is
      // process-global and several keys are user-scoped (owned/voted elections,
      // existing ballot), so without this the incoming user would briefly read
      // the previous user's data from cache while refetching. Token refreshes
      // keep the same id and are left untouched.
      if (
        lastUserIdRef.current !== undefined &&
        lastUserIdRef.current !== nextUserId
      ) {
        queryClient.clear()
      }
      lastUserIdRef.current = nextUserId
      setSession(next)
      setLoading(false)
    }

    // Initial restore. onAuthStateChange also fires an INITIAL_SESSION event,
    // but resolving getSession() explicitly is what lets us flip `loading` off.
    // On any error (or rejection) treat the user as signed out and stop loading,
    // so guards never hang on a stuck `loading` flag.
    supabase.auth
      .getSession()
      .then(({ data, error }) => applySession(error ? null : data.session))
      .catch(() => applySession(null))

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => applySession(nextSession),
    )

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
