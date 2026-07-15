import { createBrowserRouter } from 'react-router-dom'
import { Home } from '@/routes/Home'
import { Learn } from '@/routes/Learn'
import { Privacy } from '@/routes/Privacy'
import { Terms } from '@/routes/Terms'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { Signup } from '@/routes/Signup'
import { ForgotPassword } from '@/routes/ForgotPassword'
import { Dashboard } from '@/routes/Dashboard'
import { Design } from '@/routes/Design'
import { ElectionDetail } from '@/components/elections/ElectionDetail'
import { Ballot } from '@/routes/Ballot'
import { PublicBallot } from '@/routes/PublicBallot'
import { ElectionForm } from '@/routes/ElectionForm'
import { JoinElection } from '@/routes/JoinElection'
import { Settings } from '@/routes/Settings'
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
    // Public info pages (M13). Unguarded — these are hit by external links and
    // must render for signed-out visitors. Paths match the Flutter routes
    // (/learn, /privacy, /tos in lib/config/router.dart) to keep deep links
    // stable across the cutover.
    path: '/learn',
    element: <Learn />,
  },
  {
    path: '/privacy',
    element: <Privacy />,
  },
  {
    path: '/tos',
    element: <Terms />,
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
    path: '/election/:id/ballot/:index',
    element: (
      <RequireAuth>
        <PublicBallot />
      </RequireAuth>
    ),
  },
  {
    // Join via an invite link / QR (M12). RequireAuth threads `redirect=` so an
    // unauthenticated visitor lands back here after login/signup (INV-04). The
    // screen joins and forwards to the election detail.
    path: '/election/:id/join',
    element: (
      <RequireAuth>
        <JoinElection />
      </RequireAuth>
    ),
  },
  {
    // Settings / account management (M14). Auth-gated, matching the Flutter
    // GoRoute('/settings') reached from the dashboard's settings affordance.
    path: '/settings',
    element: (
      <RequireAuth>
        <Settings />
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
