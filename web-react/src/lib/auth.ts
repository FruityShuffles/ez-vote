import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { safeRedirect } from '@/auth/redirect'

// Thin wrappers over supabase.auth — the React port of
// `lib/data/repositories/auth_repository.dart`. Each throws on failure (the
// supabase-js promises reject with AuthError); callers handle errors via
// friendlyAuthError. Session state itself is observed through AuthProvider, not
// returned here.

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email: string, password: string, displayName?: string) {
  // Mirrors the Dart default: fall back to the local-part of the email when no
  // display name is given.
  const name = displayName?.trim() || email.split('@')[0]
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  })
  if (error) throw error
}

export async function verifyOtp(email: string, token: string, type: EmailOtpType) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type })
  if (error) throw error
}

export async function signInWithGoogle(redirect?: string | null) {
  // Thread the deep-link destination through OAuth so a voter who deep-linked to
  // a ballot lands back on it after Google sign-in (a deliberate UX improvement
  // over the Flutter reference, which always returned to /dashboard). After the
  // browser returns, detectSessionInUrl establishes the session on that route.
  const redirectTo = `${window.location.origin}${safeRedirect(redirect)}`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
}

export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Account deletion (delete_current_user RPC) belongs to the Settings surface;
// the full flow is ported in M14.
