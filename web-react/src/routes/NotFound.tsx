import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'

// Catch-all route. Confirms client-side SPA routing handles unknown paths
// (the path that exercises the Pages `_redirects` fallback at the edge).
export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Go home
      </Link>
    </main>
  )
}
