import { createBrowserRouter } from 'react-router-dom'
import { Home } from '@/routes/Home'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { Signup } from '@/routes/Signup'
import { ForgotPassword } from '@/routes/ForgotPassword'
import { Dashboard } from '@/routes/Dashboard'
import { RedirectIfAuthed, RequireAuth } from '@/auth/guards'

// Browser (history-API) routing. The Cloudflare Pages `_redirects` SPA fallback
// (public/_redirects) rewrites every unknown path to index.html so deep links
// resolve client-side — the same trick the Flutter build uses today.
//
// Auth routes are wrapped in RedirectIfAuthed (signed-in users skip them and go
// to their `redirect=` destination); protected routes in RequireAuth (signed-out
// users are bounced to /login?redirect=<here>). This reproduces the GoRouter
// redirect callback in `lib/config/router.dart`.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <Login />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/signup',
    element: (
      <RedirectIfAuthed>
        <Signup />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <RedirectIfAuthed>
        <ForgotPassword />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <Dashboard />
      </RequireAuth>
    ),
  },
  {
    path: '*',
    element: <NotFound />,
  },
])
