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
import { ElectionCrumb } from '@/components/Breadcrumbs'
import { ElectionWorkspace } from '@/components/ElectionWorkspace'
import { ElectionDetail } from '@/components/elections/ElectionDetail'
import { Ballot } from '@/routes/Ballot'
import { PublicBallot } from '@/routes/PublicBallot'
import {
  CounterfactualEditor,
  CounterfactualPicker,
} from '@/routes/CounterfactualExplorer'
import { ElectionEdit, ElectionForm } from '@/routes/ElectionForm'
import { JoinElection } from '@/routes/JoinElection'
import { Settings } from '@/routes/Settings'
import { RedirectIfAuthed } from '@/auth/guards'
import {
  AppLayout,
  AppLayoutError,
  type RouteHandle,
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
            handle: { width: 'md' } satisfies RouteHandle,
          },
          {
            path: 'create',
            element: <ElectionForm />,
            handle: { width: 'md' } satisfies RouteHandle,
          },
          {
            path: 'election/:id',
            children: [
              {
                // Join is deliberately beside the election read gate.
                path: 'join',
                element: <JoinElection />,
                handle: { width: 'md' } satisfies RouteHandle,
              },
              {
                element: <ElectionWorkspace />,
                handle: {
                  width: 'md',
                  crumb: ElectionCrumb,
                } satisfies RouteHandle,
                children: [
                  {
                    index: true,
                    element: <ElectionDetail />,
                    handle: { width: 'md' } satisfies RouteHandle,
                  },
                  {
                    path: 'edit',
                    element: <ElectionEdit />,
                    handle: { width: 'md', crumb: 'Edit' } satisfies RouteHandle,
                  },
                  {
                    path: 'vote',
                    element: <Ballot />,
                    handle: { width: 'sm', crumb: 'Vote' } satisfies RouteHandle,
                  },
                  {
                    path: 'ballot/:index',
                    element: <PublicBallot />,
                    handle: { width: 'sm', crumb: 'Ballot' } satisfies RouteHandle,
                  },
                  {
                    path: 'explore',
                    handle: { width: 'lg', crumb: 'Explore' } satisfies RouteHandle,
                    children: [
                      { index: true, element: <CounterfactualPicker /> },
                      {
                        path: ':voterId',
                        element: <CounterfactualEditor />,
                        handle: {
                          width: 'lg',
                          crumb: 'Edit ballot',
                        } satisfies RouteHandle,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: 'settings',
            element: <Settings />,
            handle: { width: 'md' } satisfies RouteHandle,
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
