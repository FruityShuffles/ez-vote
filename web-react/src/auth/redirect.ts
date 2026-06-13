// Pure redirect-threading logic for the auth flow — the React port of the
// `redirect=` handling in the Flutter `lib/config/router.dart`. Kept free of any
// Supabase import so it stays unit-testable without build-time env vars.
//
// AUTH-01 (parity checklist): the `redirect=` query param must thread through the
// full login → signup → OTP chain and land on the original destination.

// Auth routes are never a valid *final* destination — resolving a redirect to one
// would bounce an already-authenticated user straight back into RedirectIfAuthed
// (potential replace-loop with nested `?redirect=/login?...` params).
const AUTH_ROUTES = new Set(['/login', '/signup', '/forgot-password'])

/**
 * Resolve a `redirect=` query-param value to a safe in-app destination.
 *
 * Mirrors `router.dart`, which decodes the param and honours it only when it
 * `startsWith('/')`, otherwise falling back to `/dashboard`. We additionally
 * reject protocol-relative URLs (`//host`, `/\host`) — these also start with
 * `/` but navigate off-origin, a latent open-redirect in the Flutter check.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return '/dashboard'

  let dest: string
  try {
    dest = decodeURIComponent(raw)
  } catch {
    // Malformed percent-encoding — don't trust it.
    return '/dashboard'
  }

  // Must be a root-relative path. Reject `//` and `/\` (protocol-relative URLs
  // the browser would resolve to another origin).
  if (!dest.startsWith('/') || dest.startsWith('//') || dest.startsWith('/\\')) {
    return '/dashboard'
  }

  // Never resolve to an auth route (strip query/hash before comparing).
  const path = dest.split(/[?#]/, 1)[0]
  if (AUTH_ROUTES.has(path)) return '/dashboard'

  return dest
}

/**
 * Build an auth-route path that carries the `redirect=` param forward, so the
 * destination survives navigation between login / signup / forgot-password.
 * Mirrors the Flutter cross-links (e.g. `/signup?redirect=${encode(redirect)}`).
 */
export function withRedirect(path: string, redirect: string | null | undefined): string {
  if (!redirect) return path
  return `${path}?redirect=${encodeURIComponent(redirect)}`
}
