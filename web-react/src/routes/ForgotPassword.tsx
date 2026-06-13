import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { sendPasswordResetEmail, signOut, updatePassword, verifyOtp } from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Functional M6 password-recovery screen (two phases: request code → OTP + new
// password), porting `forgot_password_screen.dart` (AUTH-03). verifyOtp(recovery)
// establishes a recovery session, updatePassword sets the new password, and
// RedirectIfAuthed routes to the `redirect=` destination. Functional styling only.

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function ForgotPassword() {
  const [params] = useSearchParams()
  const redirect = params.get('redirect')

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await sendPasswordResetEmail(email.trim())
      setCodeSent(true)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // verifyOtp(recovery) establishes a session, after which RedirectIfAuthed
      // will navigate away. If the subsequent updatePassword fails we'd be left
      // authenticated with an unchanged password and the error unseen — so on
      // failure sign back out (clearing that half-finished state) and rethrow to
      // surface the error.
      await verifyOtp(email.trim(), otp.trim(), 'recovery')
      try {
        await updatePassword(password)
      } catch (err) {
        await signOut()
        throw err
      }
      // Success → RedirectIfAuthed navigates to the redirect destination.
    } catch (err) {
      setError(friendlyAuthError(err))
      setLoading(false)
    }
  }

  if (codeSent) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 8-digit code we sent to {email.trim()} and choose a new password.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleReset}>
            <input
              inputMode="numeric"
              maxLength={8}
              required
              aria-label="Confirmation code"
              className={`${inputClass} text-center tracking-widest`}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              aria-label="New password"
              placeholder="New password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
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
        <h1 className="text-center text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a recovery code.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSendCode}>
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send recovery code'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
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
