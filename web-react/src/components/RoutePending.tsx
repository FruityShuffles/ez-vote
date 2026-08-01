import { useNavigation } from 'react-router-dom'

import { AppShell } from '@/components/ui/app-shell'
import { CenteredState } from '@/components/ui/centered-state'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'

export function RoutePendingIndicator() {
  const navigation = useNavigation()
  if (navigation.state === 'idle') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/20"
    >
      <div className="h-full w-1/3 animate-pulse bg-primary" />
      <span className="sr-only">Loading page…</span>
    </div>
  )
}

export function InitialRouteFallback() {
  return (
    <AppShell brandTo="/" width="md">
      <CenteredState>
        <Spinner className="size-6 text-muted-foreground" />
        <Muted>Loading page…</Muted>
      </CenteredState>
    </AppShell>
  )
}
