// Maps Supabase auth errors to friendly, user-facing messages — the React port
// of `_friendlyAuthError` in `lib/presentation/screens/forgot_password_screen.dart`.
// Pure (no Supabase import) so it is testable without build-time env vars.
//
// supabase-js throws `AuthError` instances carrying a stable `.code`; we match on
// those codes and otherwise fall back to the raw message.

const FRIENDLY_BY_CODE: Record<string, string> = {
  over_email_send_rate_limit: 'Too many requests. Please wait a minute and try again.',
  otp_expired: 'That code is invalid or expired. Request a new one.',
  invalid_otp: 'That code is invalid or expired. Request a new one.',
  token_not_found: 'That code is invalid or expired. Request a new one.',
  same_password: 'New password must be different from the old one.',
  weak_password: 'Password is too weak. Use at least 6 characters.',
}

export function friendlyAuthError(e: unknown): string {
  if (e && typeof e === 'object') {
    const code = 'code' in e ? String((e as { code?: unknown }).code ?? '') : ''
    if (code && code in FRIENDLY_BY_CODE) return FRIENDLY_BY_CODE[code]

    const message = 'message' in e ? (e as { message?: unknown }).message : undefined
    if (typeof message === 'string' && message) return message
  }
  return e instanceof Error ? e.message : String(e)
}
