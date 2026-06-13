import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/layout'
import { EZVoteLogo } from '@/components/EZVoteLogo'

// The Scaffold + AppBar equivalent: a sticky branded header over a main content
// region. Surfaces (M9+) wrap their content in this; M7 ships the primitive and
// only the design showcase / dashboard stub mount it, leaving full dashboard
// layout to M9.
//
// `actions` is the trailing header slot (account menu, primary CTA). `brandTo`
// is where the logo links (default the dashboard). The logo link carries the
// accessible name, so the lockup itself stays decorative.

export function AppShell({
  children,
  actions,
  brandTo = '/dashboard',
  width = 'lg',
  className,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  brandTo?: string
  width?: React.ComponentProps<typeof Container>['width']
  className?: string
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <Container
          width={width}
          className="flex h-14 items-center justify-between gap-4"
        >
          <Link
            to={brandTo}
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="EZVote home"
          >
            <EZVoteLogo className="text-base" />
          </Link>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </Container>
      </header>
      <main className={cn('flex-1 py-8', className)}>
        <Container width={width}>{children}</Container>
      </main>
    </div>
  )
}
