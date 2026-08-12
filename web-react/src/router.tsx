import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { ElectionCrumb } from '@/components/Breadcrumbs'
import { ElectionWorkspace } from '@/components/ElectionWorkspace'
import { InitialRouteFallback } from '@/components/RoutePending'
import { RedirectIfAuthed, RequireAccount } from '@/auth/guards'
import {
  AppLayout,
  AppLayoutError,
  type RouteHandle,
} from '@/components/AppLayout'
import { RootLayout } from '@/components/RootLayout'
import { RouteError } from '@/components/RouteError'
import { AppShell } from '@/components/ui/app-shell'

function lazyComponent(load: () => Promise<ComponentType>) {
  return async () => ({ Component: await load() })
}

function lazyAuthComponent(load: () => Promise<ComponentType>) {
  return async () => {
    const Screen = await load()
    return {
      Component: () => (
        <RedirectIfAuthed>
          <Screen />
        </RedirectIfAuthed>
      ),
    }
  }
}

function lazyAccountComponent(load: () => Promise<ComponentType>) {
  return async () => {
    const Screen = await load()
    return {
      Component: () => (
        <RequireAccount>
          <Screen />
        </RequireAccount>
      ),
    }
  }
}

// Browser (history-API) routing. The Cloudflare Pages `_redirects` SPA fallback
// (public/_redirects) rewrites every unknown path to index.html so deep links
// resolve client-side.
//
// Auth routes are wrapped in RedirectIfAuthed (signed-in users skip them and go
// to their `redirect=` destination). App routes inherit RequireAuth, which also
// admits sessionless guests; write routes add RequireAccount and send guests to
// signup with the requested destination preserved.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: (
      <AppShell brandTo="/" width="md">
        <RouteError />
      </AppShell>
    ),
    hydrateFallbackElement: <InitialRouteFallback />,
    children: [
      {
        index: true,
        lazy: lazyComponent(async () => (await import('@/routes/Home')).Home),
      },
      // Public and auth routes stay outside AppLayout.
      {
        path: 'learn',
        lazy: lazyComponent(async () => (await import('@/routes/Learn')).Learn),
      },
      {
        path: 'privacy',
        lazy: lazyComponent(
          async () => (await import('@/routes/Privacy')).Privacy,
        ),
      },
      {
        path: 'tos',
        lazy: lazyComponent(async () => (await import('@/routes/Terms')).Terms),
      },
      {
        path: 'login',
        lazy: lazyAuthComponent(
          async () => (await import('@/routes/Login')).Login,
        ),
      },
      {
        path: 'signup',
        lazy: lazyAuthComponent(
          async () => (await import('@/routes/Signup')).Signup,
        ),
      },
      {
        path: 'forgot-password',
        lazy: lazyAuthComponent(
          async () => (await import('@/routes/ForgotPassword')).ForgotPassword,
        ),
      },
      {
        element: <AppLayout />,
        errorElement: <AppLayoutError />,
        children: [
          {
            path: 'dashboard',
            lazy: lazyComponent(
              async () => (await import('@/routes/Dashboard')).Dashboard,
            ),
            handle: { width: 'md' } satisfies RouteHandle,
          },
          {
            path: 'create',
            lazy: lazyAccountComponent(
              async () => (await import('@/routes/ElectionForm')).ElectionForm,
            ),
            handle: { width: 'md' } satisfies RouteHandle,
          },
          {
            path: 'election/:id',
            children: [
              {
                // Join is deliberately beside the election read gate.
                path: 'join',
                lazy: lazyAccountComponent(
                  async () =>
                    (await import('@/routes/JoinElection')).JoinElection,
                ),
                handle: { width: 'md' } satisfies RouteHandle,
              },
              {
                element: (
                  <RequireAccount>
                    <ElectionWorkspace />
                  </RequireAccount>
                ),
                handle: {
                  width: 'md',
                  crumb: ElectionCrumb,
                } satisfies RouteHandle,
                children: [
                  {
                    path: 'edit',
                    lazy: lazyComponent(
                      async () =>
                        (await import('@/routes/ElectionForm')).ElectionEdit,
                    ),
                    handle: {
                      width: 'md',
                      crumb: 'Edit',
                    } satisfies RouteHandle,
                  },
                  {
                    path: 'vote',
                    lazy: lazyComponent(
                      async () => (await import('@/routes/Ballot')).Ballot,
                    ),
                    handle: {
                      width: 'sm',
                      crumb: 'Vote',
                    } satisfies RouteHandle,
                  },
                ],
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
                    lazy: lazyComponent(
                      async () =>
                        (await import('@/components/elections/ElectionDetail'))
                          .ElectionDetail,
                    ),
                    handle: { width: 'md' } satisfies RouteHandle,
                  },
                  {
                    path: 'ballot/:index',
                    lazy: lazyComponent(
                      async () =>
                        (await import('@/routes/PublicBallot')).PublicBallot,
                    ),
                    handle: {
                      width: 'sm',
                      crumb: 'Ballot',
                    } satisfies RouteHandle,
                  },
                  {
                    path: 'explore',
                    handle: {
                      width: 'lg',
                      crumb: 'Explore',
                    } satisfies RouteHandle,
                    children: [
                      {
                        index: true,
                        lazy: lazyComponent(
                          async () =>
                            (await import('@/routes/CounterfactualExplorer'))
                              .CounterfactualPicker,
                        ),
                      },
                      {
                        path: ':voterId',
                        lazy: lazyComponent(
                          async () =>
                            (await import('@/routes/CounterfactualExplorer'))
                              .CounterfactualEditor,
                        ),
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
            lazy: lazyComponent(
              async () => (await import('@/routes/Settings')).Settings,
            ),
            handle: { width: 'md' } satisfies RouteHandle,
          },
        ],
      },
      {
        path: 'design',
        lazy: lazyComponent(
          async () => (await import('@/components/DesignLayout')).DesignLayout,
        ),
        children: [
          {
            index: true,
            lazy: lazyComponent(
              async () => (await import('@/routes/Design')).Design,
            ),
          },
          {
            path: 'explore',
            lazy: lazyComponent(
              async () =>
                (await import('@/routes/DesignExplore')).DesignExplore,
            ),
          },
        ],
      },
      {
        path: '*',
        lazy: lazyComponent(
          async () => (await import('@/routes/NotFound')).NotFound,
        ),
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
