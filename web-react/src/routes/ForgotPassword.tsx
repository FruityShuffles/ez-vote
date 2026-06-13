import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { AuthCard } from '@/components/AuthCard'
import {
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  verifyOtp,
} from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Password-recovery screen (two phases: request code → OTP + new password),
// restyled onto the M7 design system. Behavior is unchanged from M6 (AUTH-03):
// verifyOtp(recovery) establishes a recovery session, updatePassword sets the new
// password, and RedirectIfAuthed routes to the `redirect=` destination.

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
      <AuthCard
        title="Check your email"
        subtitle={`Enter the 8-digit code we sent to ${email.trim()} and choose a new password.`}
      >
        <form onSubmit={handleReset}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="otp">Confirmation code</FieldLabel>
              <Input
                id="otp"
                inputMode="numeric"
                maxLength={8}
                required
                className="text-center tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </Button>
          </FieldGroup>
        </form>
        <p className="text-center text-sm">
          <Link
            to={withRedirect('/login', redirect)}
            className="text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your email and we'll send you a recovery code."
    >
      <form onSubmit={handleSendCode}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send recovery code'}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm">
        <Link
          to={withRedirect('/login', redirect)}
          className="text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  )
}
