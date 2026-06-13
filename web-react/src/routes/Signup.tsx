import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { signInWithGoogle, signUp, verifyOtp } from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Functional M6 signup screen (two phases: register → OTP verification), porting
// `signup_screen.dart`. On OTP success the session is established and
// RedirectIfAuthed routes to the `redirect=` destination (AUTH-01). Styling is
// functional-only; M7/M13 refine it.

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function Signup() {
  const [params] = useSearchParams()
  const redirect = params.get('redirect')

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signUp(email.trim(), password, displayName)
      setEmailSent(true)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await verifyOtp(email.trim(), otp.trim(), 'signup')
      // RedirectIfAuthed navigates once the session updates.
    } catch (err) {
      setError(friendlyAuthError(err))
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle(redirect)
    } catch (err) {
      setError(friendlyAuthError(err))
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 8-digit code we sent to {email.trim()}.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleVerify}>
            <input
              inputMode="numeric"
              maxLength={8}
              required
              aria-label="Confirmation code"
              className={`${inputClass} text-center tracking-widest`}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Confirming…' : 'Confirm'}
            </Button>
          </form>
          <p className="mt-4 text-sm">
            <Link
              to={withRedirect('/login', redirect)}
              className="text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Create account</h1>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSignUp}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Display name (optional)
            <input
              type="text"
              autoComplete="name"
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
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
              autoComplete="new-password"
              required
              minLength={6}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Sign Up'}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="lg" className="w-full" disabled={loading} onClick={handleGoogle}>
          Continue with Google
        </Button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={withRedirect('/login', redirect)}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
