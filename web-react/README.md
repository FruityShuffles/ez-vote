# EZVote — React app (`web-react/`)

The React build of EZVote, replacing the Flutter app via the migration in
[`docs/Migration/Overview.md`](../docs/Migration/Overview.md). Stack decided in
[`docs/Migration/Tech Stack.md`](../docs/Migration/Tech%20Stack.md):

- **Vite + React Router** — client-rendered SPA (no SSR), deployed as static
  assets to Cloudflare Pages.
- **TanStack Query** (server state) + **Zustand** (minimal client state).
- **Tailwind CSS** + **shadcn / Base UI** primitives (component source owned in
  `src/components/ui/`).
- **Vitest** + Testing Library for tests.

Scaffolded in M5. Auth/session is M6; surface ports are M8+.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the Supabase values (same project as Flutter; see root .env)
```

Vite only exposes `VITE_`-prefixed env vars to the client and inlines them at
build time (mirrors the Flutter `--dart-define` flow):

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

## Commands

```bash
npm run dev          # Vite dev server (HMR)
npm run build        # type-check (tsc -b) + production build to dist/
npm run preview      # serve the production build locally
npm run lint         # ESLint
npm run typecheck    # tsc -b (no emit)
npm run test         # Vitest (watch)
npm run test:run     # Vitest (single run, used in CI)
npm run format       # Prettier write
```

CI: `.github/workflows/web-react-ci.yml` runs lint → type-check → test → build
on any change under `web-react/`.

## Deploy (Cloudflare Pages — staging)

Static build deployed to the **`ez-vote-react`** Pages project (staging URL
`https://ez-vote-react.pages.dev`; friendly `next.ez-vote.org` custom domain is
a separate dashboard/DNS step). Authenticate once, then:

```bash
# Auth (one-time): either `npx wrangler login`, or set
#   CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit + Account: Read) and CLOUDFLARE_ACCOUNT_ID
npx wrangler pages project create ez-vote-react --production-branch main   # one-time
npm run build
npx wrangler pages deploy dist --project-name ez-vote-react
```

`public/_redirects` (`/* /index.html 200`) gives the SPA its deep-link fallback
at the edge; `public/_headers` disables caching of `index.html`. Both are copied
into `dist/` by Vite.
