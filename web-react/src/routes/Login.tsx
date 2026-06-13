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
import { signIn, signInWithGoogle } from '@/lib/auth'
import { friendlyAuthError } from '@/auth/errors'
import { withRedirect } from '@/auth/redirect'

// Login screen, restyled onto the M7 design system. Behavior is unchanged from
// the M6 wiring: on success it does NOT navigate — RedirectIfAuthed reacts to the
// session change and routes to the `redirect=` destination, keeping redirect
// resolution in one place (AUTH-01).

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
    <AuthCard title="Sign in" subtitle="Sign in to continue">
      <form onSubmit={handleSignIn}>
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
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-right">
              <Link
                to={withRedirect('/forgot-password', redirect)}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </Field>

          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
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
        Don&apos;t have an account?{' '}
        <Link
          to={withRedirect('/signup', redirect)}
          className="text-primary underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthCard>
  )
}
