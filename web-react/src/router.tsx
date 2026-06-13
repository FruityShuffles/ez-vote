import { createBrowserRouter } from 'react-router-dom'
import { Home } from '@/routes/Home'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { Signup } from '@/routes/Signup'
import { ForgotPassword } from '@/routes/ForgotPassword'
import { Dashboard } from '@/routes/Dashboard'
import { Design } from '@/routes/Design'
import { ElectionDetail } from '@/components/elections/ElectionDetail'
import { Ballot } from '@/routes/Ballot'
import { ElectionForm } from '@/routes/ElectionForm'
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
    path: '/create',
    element: (
      <RequireAuth>
        <ElectionForm />
      </RequireAuth>
    ),
  },
  {
    path: '/election/:id/edit',
    element: (
      <RequireAuth>
        <ElectionForm />
      </RequireAuth>
    ),
  },
  {
    path: '/election/:id',
    element: (
      <RequireAuth>
        <ElectionDetail />
      </RequireAuth>
    ),
  },
  {
    // Ballot / voting flow (M10). Reached from the detail surface; renders
    // read-only when the election is closed (the "View Ballot" affordance).
    path: '/election/:id/vote',
    element: (
      <RequireAuth>
        <Ballot />
      </RequireAuth>
    ),
  },
  {
    // Internal design-system gallery (M7). Not linked from the app nav; it has no
    // data and no auth guard, and exists for visual verification of the shared
    // components against Flutter (and the M18 side-by-side review).
    path: '/design',
    element: <Design />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
])
