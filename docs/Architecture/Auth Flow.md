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

OAuth-only accounts (Google) can also use this flow: `updateUser(password)` on a recovery session will _attach_ a password to a previously password-less account, after which the user can sign in with either Google or email/password. This is generally desirable — a user who forgot they signed up via Google can self-rescue — but worth noting since it changes the account's auth methods.

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

`AuthProvider` (`src/auth/AuthProvider.tsx`) owns the session plus sessionless guest state and publishes both through `AuthContext` (`src/auth/context.ts`); components read them with `useAuth()`.

It seeds from `supabase.auth.getSession()` — which covers a persisted session restored on page load — then subscribes to `onAuthStateChange` so sign-in, sign-out, and token refresh propagate live. Resolving `getSession()` explicitly is what flips the `loading` flag off; on error it treats the user as signed out so guards never hang.

**Cache invalidation on account change.** The `QueryClient` is process-global and several keys are user-scoped (owned/voted elections, existing ballot). `AuthProvider` tracks the last published user id and calls `queryClient.clear()` whenever it actually changes — sign-out, sign-in, or switching accounts without a page reload. Without this, an incoming user would briefly read the previous user's data from cache while refetching. Token refreshes keep the same id and are deliberately left untouched.

## Guest Mode

Guest mode is deliberately **not** Supabase anonymous authentication. Clicking **Continue as guest** stores `ezvote:guest = true` in browser local storage and admits the visitor to the app shell with no session, JWT, `auth.users` row, or profile. Reads therefore run as the Supabase `anon` role; public-election RLS remains the source of truth for what a guest can see.

The flag survives reloads. Any real session received by `AuthProvider` clears it, so login, signup, and OAuth cleanly replace guest state. Guests default to the Case Studies dashboard tab, can use Learn and the read-only public-election/what-if surfaces, and see My Elections as a locked account upsell. User-scoped list and existing-ballot queries are not run for them.

The app bar replaces **Sign out** with **Create account**, while Settings keeps only its Legal section. Account-owned write routes use `RequireAccount`: guests who request create, edit, vote, or join are sent to `/signup?redirect=<requested-path>`. They return to that path once account creation establishes a real session. RLS still denies every anonymous write as the backend safety net.

## Route Guards

There is no central redirect callback. The auth screens retain their own `RedirectIfAuthed` guards, one `RequireAuth` wraps the app layout, and write routes add `RequireAccount` in `src/router.tsx`:

| Guard              | Wraps                                   | Behavior                                                                                                         |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `RequireAuth`      | the `AppLayout` branch                  | Real session or guest flag → render; neither → `<Navigate to={withRedirect('/login', here)} replace />`          |
| `RequireAccount`   | `/create`, election edit/vote, and join | Real session → render; guest → `/signup?redirect=<here>`; ordinary signed-out visitor → `/login?redirect=<here>` |
| `RedirectIfAuthed` | `/login`, `/signup`, `/forgot-password` | Has session → `<Navigate to={safeRedirect(params.get('redirect'))} replace />`                                   |

All three render a brief loading placeholder while `loading` is true, so a guard never flashes a redirect before auth state is known.

**Post-auth navigation is guard-driven, not manual.** The auth screens do not `navigate()` after `await signIn()` — the session updates asynchronously via `onAuthStateChange`, so an immediate navigation would race a guard that hasn't seen the new session yet. Instead the screens stay put and `RedirectIfAuthed` reacts to the session change. One source of truth for redirect resolution (AUTH-01).

## Redirect Threading

`src/auth/redirect.ts` is pure and Supabase-free, so it is unit-tested without build-time env vars (`redirect.test.ts`).

- **`safeRedirect(raw)`** — decodes the param and returns it only when it is a root-relative in-app path; otherwise `/dashboard`. It rejects: malformed percent-encoding, anything not starting with `/`, protocol-relative URLs (`//host`, `/\host`) that would navigate off-origin, and the auth routes themselves (resolving to `/login` would bounce an authenticated user straight back into `RedirectIfAuthed`, risking a replace-loop).
- **`withRedirect(path, redirect)`** — builds an auth-route path carrying the param forward, so the destination survives navigation between login / signup / forgot-password.
