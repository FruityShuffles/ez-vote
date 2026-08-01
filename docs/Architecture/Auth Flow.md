# Auth Flow

The client half lives in `web-react/src/auth/` (session context, guards, redirect threading) and `web-react/src/lib/auth.ts` (thin wrappers over `supabase.auth`). The server half — the `handle_new_user()` trigger and the `delete_current_user()` RPC — is in [[Backend/RPC Functions]] and [[Backend/Schema]].

## Signup (Email/Password)

Two-phase flow: registration then OTP verification.

```
1. routes/Signup.tsx: user enters email, password, display name
2. signUp(email, password, displayName)
   → supabase.auth.signUp() sends OTP email
   → display name defaults to the local-part of the email when blank
3. Signup transitions to its OTP verification form (same route, same redirect param)
4. User enters 8-digit OTP
5. verifyOtp(email, token, 'signup')
   → Supabase verifies the token and establishes a session
   → DB trigger `on_auth_user_confirmed` fires → calls handle_new_user()
   → handle_new_user() upserts a row in `profiles` (ON CONFLICT DO NOTHING)
6. AuthProvider's onAuthStateChange fires → AuthContext publishes the session
7. RedirectIfAuthed navigates to the `redirect` destination, or /dashboard
```

The `redirect` query param is threaded through the entire flow:
- `/login?redirect=/election/abc/vote`
- → `/signup?redirect=/election/abc/vote`
- → OTP verification (same route, same param)
- → on success: `<Navigate to="/election/abc/vote" replace />`

## Google OAuth

```
1. routes/Login.tsx: user clicks "Sign in with Google"
2. signInWithGoogle(redirect)
   → supabase.auth.signInWithOAuth({ provider: 'google', redirectTo })
   → Browser redirect to Google → callback to Supabase → back to redirectTo
3. detectSessionInUrl establishes the session on the returned route
4. DB trigger `on_auth_user_created` fires → calls handle_new_user()
   → handle_new_user() upserts profile row (idempotent via ON CONFLICT DO NOTHING)
5. AuthProvider publishes the session; the guards handle navigation
```

`redirectTo` is `window.location.origin` + the resolved `redirect` destination, so a voter who deep-linked to a ballot lands back on that ballot rather than the dashboard.

Two separate triggers (`on_auth_user_confirmed` for the email flow, `on_auth_user_created` for OAuth) both call the same `handle_new_user()` function. The idempotency guard means double-firing is safe.

## Password Recovery

OTP-based, mirrors the signup flow.

```
1. routes/ForgotPassword.tsx stage 1: user enters email
2. sendPasswordResetEmail(email)
   → supabase.auth.resetPasswordForEmail() sends OTP email
3. ForgotPassword stage 2: user enters 8-digit OTP + new password
4. verifyOtp(email, token, 'recovery')
   → Supabase verifies the token, establishing a recovery session (user is now signed in)
5. updatePassword(newPassword)
   → supabase.auth.updateUser({ password })
6. AuthProvider publishes the session; guards redirect to the `redirect` destination or /dashboard
```

The `redirect` query param is threaded through `/login → /forgot-password → success` the same way it is for signup.

The Supabase **"Reset Password" email template must include `{{ .Token }}`** to render the 8-digit OTP. Without it, recovery emails arrive with only a magic link and the in-app OTP field has no code to enter.

OAuth-only accounts (Google) can also use this flow: `updateUser(password)` on a recovery session will *attach* a password to a previously password-less account, after which the user can sign in with either Google or email/password. This is generally desirable — a user who forgot they signed up via Google can self-rescue — but worth noting since it changes the account's auth methods.

## Logout

```
1. signOut()
2. Supabase clears the session
3. AuthProvider's onAuthStateChange fires with a null session
4. queryClient.clear() drops all cached server state (see below)
5. RequireAuth on the current route redirects to /login?redirect=<here>
```

## Delete Account

```
1. routes/Settings.tsx calls deleteAccount()
2. Calls the `delete_current_user()` RPC (security-definer)
3. RPC: nullifies voter_id on ballots, deletes from election_voters,
        deletes the profile row, deletes from auth.users
4. signOut(), then redirect to /login
```

The ballot nullification preserves election result integrity — ballots remain counted but anonymized.

## Auth State in the App

`AuthProvider` (`src/auth/AuthProvider.tsx`) owns the session and publishes it through `AuthContext` (`src/auth/context.ts`); components read it with `useAuth()`.

It seeds from `supabase.auth.getSession()` — which covers a persisted session restored on page load — then subscribes to `onAuthStateChange` so sign-in, sign-out, and token refresh propagate live. Resolving `getSession()` explicitly is what flips the `loading` flag off; on error it treats the user as signed out so guards never hang.

**Cache invalidation on account change.** The `QueryClient` is process-global and several keys are user-scoped (owned/voted elections, existing ballot). `AuthProvider` tracks the last published user id and calls `queryClient.clear()` whenever it actually changes — sign-out, sign-in, or switching accounts without a page reload. Without this, an incoming user would briefly read the previous user's data from cache while refetching. Token refreshes keep the same id and are deliberately left untouched.

## Route Guards

There is no central redirect callback. Guards wrap routes individually in `src/router.tsx`:

| Guard | Wraps | Behavior |
|---|---|---|
| `RequireAuth` | every protected route | No session → `<Navigate to={withRedirect('/login', here)} replace />`, where `here` is the current path + search + hash |
| `RedirectIfAuthed` | `/login`, `/signup`, `/forgot-password` | Has session → `<Navigate to={safeRedirect(params.get('redirect'))} replace />` |

Both render a brief loading placeholder while `loading` is true, so a guard never flashes a redirect before auth state is known.

**Post-auth navigation is guard-driven, not manual.** The auth screens do not `navigate()` after `await signIn()` — the session updates asynchronously via `onAuthStateChange`, so an immediate navigation would race a guard that hasn't seen the new session yet. Instead the screens stay put and `RedirectIfAuthed` reacts to the session change. One source of truth for redirect resolution (AUTH-01).

## Redirect Threading

`src/auth/redirect.ts` is pure and Supabase-free, so it is unit-tested without build-time env vars (`redirect.test.ts`).

- **`safeRedirect(raw)`** — decodes the param and returns it only when it is a root-relative in-app path; otherwise `/dashboard`. It rejects: malformed percent-encoding, anything not starting with `/`, protocol-relative URLs (`//host`, `/\host`) that would navigate off-origin, and the auth routes themselves (resolving to `/login` would bounce an authenticated user straight back into `RedirectIfAuthed`, risking a replace-loop).
- **`withRedirect(path, redirect)`** — builds an auth-route path carrying the param forward, so the destination survives navigation between login / signup / forgot-password.
