import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

  useEffect(() => {
    let active = true

    // Initial restore. onAuthStateChange also fires an INITIAL_SESSION event,
    // but resolving getSession() explicitly is what lets us flip `loading` off.
    // On any error (or rejection) treat the user as signed out and stop loading,
    // so guards never hang on a stuck `loading` flag.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        setSession(error ? null : data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setSession(null)
        setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
