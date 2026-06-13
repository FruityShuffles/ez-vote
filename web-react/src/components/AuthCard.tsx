import { Card, CardContent } from '@/components/ui/card'
import { EZVoteLogo } from '@/components/EZVoteLogo'
import { H1, Muted } from '@/components/ui/typography'

// The shared shell for the auth screens (login / signup / forgot-password),
// extracted so the centered panel, branding, and heading aren't re-hand-rolled
// three times. Pure presentation — all auth behavior stays in the route
// components (the M6 wiring is untouched).
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardContent className="flex flex-col gap-6">
          <header className="flex flex-col items-center gap-1.5 text-center">
            <EZVoteLogo className="text-base" />
            {/* The page's h1 (size matched to the old H2 to keep the visual
                identity); each auth screen has exactly one. */}
            <H1 className="text-2xl">{title}</H1>
            {subtitle && <Muted>{subtitle}</Muted>}
          </header>
          {children}
        </CardContent>
      </Card>
    </main>
  )
}
