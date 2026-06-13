import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { signIn, signInWithGoogle } from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Functional auth screen for M6 (auth wiring). Plain Tailwind + the owned Button;
// the polished, design-system version is M7/M13. On success it does NOT navigate
// — RedirectIfAuthed reacts to the session change and routes to the `redirect=`
// destination, which keeps redirect resolution in one place (AUTH-01).

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function Login() {
  const [params] = useSearchParams()
  const redirect = params.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      // RedirectIfAuthed handles navigation once the session updates.
    } catch (err) {
      setError(friendlyAuthError(err))
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle(redirect) // full-page redirect to Google
    } catch (err) {
      setError(friendlyAuthError(err))
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">EZVote</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Sign in to continue</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSignIn}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-1 text-right">
          <Link
            to={withRedirect('/forgot-password', redirect)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="lg" className="w-full" disabled={loading} onClick={handleGoogle}>
          Continue with Google
        </Button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            to={withRedirect('/signup', redirect)}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
