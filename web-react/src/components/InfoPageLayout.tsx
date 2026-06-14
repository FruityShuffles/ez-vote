import { Link } from 'react-router-dom'

import { AppShell } from '@/components/ui/app-shell'
import { H1, H3, Prose } from '@/components/ui/typography'

// Shared shell for the static public content pages (Learn / Privacy / Terms) —
// the React equivalent of the Flutter `Scaffold` + `AppBar` + scrolling body.
// Reuses AppShell, but points the brand at the public landing (`/`) rather than
// the auth-gated dashboard, since signed-out visitors reach these via external
// links. A "← Back to home" link stands in for the AppBar back button.
export function InfoPageLayout({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <AppShell brandTo="/" width="md">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link
          to="/"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Back to home
        </Link>
        <H1>{title}</H1>
        {children}
      </div>
    </AppShell>
  )
}

// One titled block of static copy, mirroring the Flutter `_Section` widget used
// by the Privacy and Terms screens. Bodies use blank lines to separate
// paragraphs (and `•` glyphs for bullets, carried over verbatim); each paragraph
// renders as its own <p> so the spacing survives the port.
export function Section({ title, body }: { title: string; body: string }) {
  const paragraphs = body.split('\n\n')
  return (
    <section className="flex flex-col gap-2">
      <H3>{title}</H3>
      {paragraphs.map((para, i) => (
        <Prose key={i} className="whitespace-pre-line">
          {para}
        </Prose>
      ))}
    </section>
  )
}
