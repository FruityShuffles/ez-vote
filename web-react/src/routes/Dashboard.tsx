import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AppShell } from '@/components/ui/app-shell'
import { H1 } from '@/components/ui/typography'
import { Stack } from '@/components/ui/layout'
import { useAuth } from '@/auth/context'
import { signOut } from '@/lib/auth'

// Protected placeholder for M6, now wrapped in the M7 AppShell to dogfood the
// layout primitive. It still only exercises the RequireAuth guard, session
// persistence (survives reload), and sign-out — the real election-list dashboard
// is ported in M9, which owns the full layout.
export function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    // After sign-out the session clears and RequireAuth bounces back to /login.
    await signOut()
  }

  return (
    <AppShell
      width="md"
      actions={
        <Button variant="outline" disabled={loading} onClick={handleSignOut}>
          {loading ? 'Signing out…' : 'Sign out'}
        </Button>
      }
    >
      <Stack gap={6}>
        <H1>Dashboard</H1>
        <Card>
          <CardHeader>
            <CardTitle>Your elections</CardTitle>
            <CardDescription>
              Signed in as {user?.email ?? 'unknown'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your elections will appear here once the dashboard is ported (M9).
            </p>
          </CardContent>
        </Card>
      </Stack>
    </AppShell>
  )
}
