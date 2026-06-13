import { Button } from '@/components/ui/button'

// M5 hello-world placeholder. Proves the full pipeline is wired: Vite + React
// Router render this route, Tailwind styles it, and the owned shadcn Button
// (Base UI primitive) mounts. Real surfaces arrive in M8+.
export function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">EZVote</h1>
      <p className="text-muted-foreground max-w-prose">
        React migration foundation (M5). The Vite + React Router + TanStack
        Query + Tailwind + shadcn stack is wired and deploying.
      </p>
      <Button>It works</Button>
    </main>
  )
}
