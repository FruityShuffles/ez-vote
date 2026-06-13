import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/context'
import { signOut } from '@/lib/auth'

// Minimal protected placeholder for M6: it exercises the RequireAuth guard,
// session persistence (survives reload), and sign-out. The real dashboard is the
// election list ported in M9.
export function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    // After sign-out the session clears and RequireAuth bounces back to /login.
    await signOut()
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {user?.email ?? 'unknown'}
        </p>
        <Button
          variant="outline"
          size="lg"
          className="mt-6 w-full"
          disabled={loading}
          onClick={handleSignOut}
        >
          {loading ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </main>
  )
}
