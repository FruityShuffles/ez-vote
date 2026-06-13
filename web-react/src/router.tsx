import { createBrowserRouter } from 'react-router-dom'
import { Home } from '@/routes/Home'
import { NotFound } from '@/routes/NotFound'

// Browser (history-API) routing. The Cloudflare Pages `_redirects` SPA fallback
// (public/_redirects) rewrites every unknown path to index.html so deep links
// resolve client-side — the same trick the Flutter build uses today.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
])
