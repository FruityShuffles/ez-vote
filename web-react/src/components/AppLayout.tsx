import { useState } from 'react'
import { Outlet, useMatches, useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'

import { RequireAuth } from '@/auth/guards'
import { RouteError } from '@/components/RouteError'
import { AppShell } from '@/components/ui/app-shell'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'

export type AppRouteHandle = {
  width?: React.ComponentProps<typeof AppShell>['width']
}

export function AppLayout() {
  return (
    <AuthenticatedApp>
      <Outlet />
    </AuthenticatedApp>
  )
}

export function AppLayoutError() {
  return (
    <AuthenticatedApp>
      <RouteError />
    </AuthenticatedApp>
  )
}

function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppFrame>{children}</AppFrame>
    </RequireAuth>
  )
}

function AppFrame({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const matches = useMatches()
  const [signingOut, setSigningOut] = useState(false)
  const width = matches.reduce<React.ComponentProps<typeof AppShell>['width']>(
    (current, match) =>
      (match.handle as AppRouteHandle | undefined)?.width ?? current,
    'lg',
  )

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <AppShell
      width={width}
      actions={
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
          >
            <Settings />
          </Button>
          <Button
            variant="outline"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      }
    >
      {children}
    </AppShell>
  )
}
