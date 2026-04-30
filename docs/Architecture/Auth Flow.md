# Auth Flow

## Signup (Email/Password)

Two-phase flow: registration then OTP verification.

```
1. SignupScreen: user enters email, password, display name
2. AuthRepository.signUp(email, password, displayName)
   → Supabase auth.signUp() sends OTP email
3. SignupScreen transitions to OTP verification form
4. User enters 8-digit OTP
5. AuthRepository.verifyOtp(email, otp)
   → Supabase auth verifies token
   → DB trigger `on_auth_user_confirmed` fires → calls handle_new_user()
   → handle_new_user() upserts a row in `profiles` (ON CONFLICT DO NOTHING)
6. authStateProvider emits authenticated state
7. Router redirects to `redirect` param destination or `/dashboard`
```

The `redirect` query param is threaded through the entire flow:
- `/login?redirect=/election/abc/vote`
- → `/signup?redirect=/election/abc/vote`
- → OTP verification (same screen, same param)
- → on success: `context.go('/election/abc/vote')`

## Google OAuth

```
1. LoginScreen: user taps "Sign in with Google"
2. AuthRepository.signInWithGoogle()
   → Supabase auth.signInWithOAuth(google)
   → Browser redirect to Google → callback to Supabase
3. DB trigger `on_auth_user_created` fires → calls handle_new_user()
   → handle_new_user() upserts profile row (idempotent via ON CONFLICT DO NOTHING)
4. authStateProvider emits authenticated state
5. Router redirect handles navigation
```

Two separate triggers (`on_auth_user_confirmed` for email flow, `on_auth_user_created` for OAuth) both call the same `handle_new_user()` function. The idempotency guard means double-firing is safe.

## Password Recovery

OTP-based, mirrors the signup flow.

```
1. ForgotPasswordScreen stage 1: user enters email
2. AuthRepository.sendPasswordResetEmail(email)
   → Supabase auth.resetPasswordForEmail() sends OTP email
3. ForgotPasswordScreen stage 2: user enters 8-digit OTP + new password
4. AuthRepository.verifyOtp(email, otp, type: OtpType.recovery)
   → Supabase verifies token, establishes recovery session (user is now signed in)
5. AuthRepository.updatePassword(newPassword)
   → Supabase auth.updateUser({password})
6. authStateProvider emits authenticated state
7. Router redirects to `redirect` param destination or `/dashboard`
```

The `redirect` query param is threaded through `/login → /forgot-password → success` the same way it is for signup.

The Supabase **"Reset Password" email template must include `{{ .Token }}`** to render the 8-digit OTP. Without it, recovery emails arrive with only a magic link and the in-app OTP field has no code to enter.

OAuth-only accounts (Google) can also use this flow: `updateUser(password)` on a recovery session will *attach* a password to a previously password-less account, after which the user can sign in with either Google or email/password. This is generally desirable — a user who forgot they signed up via Google can self-rescue — but worth noting since it changes the account's auth methods.

## Logout

```
1. AuthRepository.signOut()
2. Supabase clears session
3. authStateProvider emits unauthenticated state
4. All data providers invalidate (they watch authStateProvider)
5. Router redirect: protected route → /login
```

## Delete Account

```
1. SettingsScreen calls AuthRepository.deleteAccount()
2. Calls `delete_current_user()` RPC (security-definer)
3. RPC: nullifies voter_id on ballots, deletes from election_voters,
         deletes profile row, calls auth.users delete
4. Session ends → authStateProvider propagates → router redirects to /
```

The ballot nullification preserves election result integrity — ballots remain counted but anonymized.

## Auth State in the App

`authStateProvider` is a `StreamProvider<AuthState>`. Every data provider watches it, so signing out or in automatically invalidates all cached data — no manual cleanup needed.

```dart
// Example pattern in providers.dart
final ownedElectionsProvider = FutureProvider<List<Election>>((ref) async {
  ref.watch(authStateProvider);  // invalidate on auth change
  final repo = ref.watch(electionRepositoryProvider);
  return repo.listOwned();
});
```

## Router Redirect Logic

GoRouter has a `redirect` callback that runs on every navigation:

```
If route requires auth AND user is null:
  → /login?redirect=<current-path>

If user is authenticated AND current route is /login or /signup:
  → redirect param value OR /dashboard
```

There is no `refreshListenable` wired to auth state. Auth-triggered navigations happen via explicit `context.go()` calls inside `authStateProvider.when()` listeners in the relevant screens.
