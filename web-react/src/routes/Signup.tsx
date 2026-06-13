import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { AuthCard } from '@/components/AuthCard'
import { signInWithGoogle, signUp, verifyOtp } from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Signup screen (two phases: register → OTP verification), restyled onto the M7
// design system. Behavior is unchanged from M6: on OTP success the session is
// established and RedirectIfAuthed routes to the `redirect=` destination (AUTH-01).

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
      <AuthCard
        title="Check your email"
        subtitle={`Enter the 8-digit code we sent to ${email.trim()}.`}
      >
        <form onSubmit={handleVerify}>
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
            {error && <FieldError>{error}</FieldError>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Confirming…' : 'Confirm'}
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
    <AuthCard title="Create account">
      <form onSubmit={handleSignUp}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="displayName">
              Display name (optional)
            </FieldLabel>
            <Input
              id="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
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
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Sign Up'}
          </Button>

          <FieldSeparator>or</FieldSeparator>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={loading}
            onClick={handleGoogle}
          >
            Continue with Google
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          to={withRedirect('/login', redirect)}
          className="text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
