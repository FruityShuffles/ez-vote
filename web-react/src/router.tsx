import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { Home } from '@/routes/Home'
import { Learn } from '@/routes/Learn'
import { Privacy } from '@/routes/Privacy'
import { Terms } from '@/routes/Terms'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { Signup } from '@/routes/Signup'
import { ForgotPassword } from '@/routes/ForgotPassword'
import { Dashboard } from '@/routes/Dashboard'
import { ElectionDetail } from '@/components/elections/ElectionDetail'
import { Ballot } from '@/routes/Ballot'
import { PublicBallot } from '@/routes/PublicBallot'
import {
  CounterfactualEditor,
  CounterfactualPicker,
} from '@/routes/CounterfactualExplorer'
import { ElectionForm } from '@/routes/ElectionForm'
import { JoinElection } from '@/routes/JoinElection'
import { Settings } from '@/routes/Settings'
import { RedirectIfAuthed } from '@/auth/guards'
import {
  AppLayout,
  AppLayoutError,
  type AppRouteHandle,
} from '@/components/AppLayout'
import { RootLayout } from '@/components/RootLayout'
import { RouteError } from '@/components/RouteError'
import { AppShell } from '@/components/ui/app-shell'

// Browser (history-API) routing. The Cloudflare Pages `_redirects` SPA fallback
// (public/_redirects) rewrites every unknown path to index.html so deep links
// resolve client-side.
//
// Auth routes are wrapped in RedirectIfAuthed (signed-in users skip them and go
// to their `redirect=` destination); protected routes in RequireAuth (signed-out
// users are bounced to /login?redirect=<here>). This reproduces the GoRouter
// redirect callback in `lib/config/router.dart`.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: (
      <AppShell brandTo="/" width="md">
        <RouteError />
      </AppShell>
    ),
    children: [
      { index: true, element: <Home /> },
      // Public and auth routes stay outside AppLayout.
      { path: 'learn', element: <Learn /> },
      { path: 'privacy', element: <Privacy /> },
      { path: 'tos', element: <Terms /> },
      {
        path: 'login',
        element: (
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        ),
      },
      {
        path: 'signup',
        element: (
          <RedirectIfAuthed>
            <Signup />
          </RedirectIfAuthed>
        ),
      },
      {
        path: 'forgot-password',
        element: (
          <RedirectIfAuthed>
            <ForgotPassword />
          </RedirectIfAuthed>
        ),
      },
      {
        element: <AppLayout />,
        errorElement: <AppLayoutError />,
        children: [
          {
            path: 'dashboard',
            element: <Dashboard />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
          {
            path: 'create',
            element: <ElectionForm />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id/edit',
            element: <ElectionForm />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id',
            element: <ElectionDetail />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id/vote',
            element: <Ballot />,
            handle: { width: 'sm' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id/ballot/:index',
            element: <PublicBallot />,
            handle: { width: 'sm' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id/explore',
            element: <CounterfactualPicker />,
            handle: { width: 'lg' } satisfies AppRouteHandle,
          },
          {
            path: 'election/:id/explore/:voterId',
            element: <CounterfactualEditor />,
            handle: { width: 'lg' } satisfies AppRouteHandle,
          },
          {
            // Join remains protected but fetches no election data before its RPC.
            path: 'election/:id/join',
            element: <JoinElection />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
          {
            path: 'settings',
            element: <Settings />,
            handle: { width: 'md' } satisfies AppRouteHandle,
          },
        ],
      },
      {
        path: 'design',
        lazy: async () => {
          const { Design } = await import('@/routes/Design')
          return { Component: Design }
        },
      },
      {
        path: 'design/explore',
        lazy: async () => {
          const { DesignExplore } = await import('@/routes/DesignExplore')
          return { Component: DesignExplore }
        },
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
