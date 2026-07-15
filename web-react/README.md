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
npm.cmd install
cp .env.example .env   # then fill in the Supabase values (same project as Flutter; see root .env)
```

Vite only exposes `VITE_`-prefixed env vars to the client and inlines them at
build time (mirrors the Flutter `--dart-define` flow):

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

## Commands

In this Windows PowerShell workspace, use `npm.cmd` / `npx.cmd` to avoid the script-execution
policy. Use plain `npm` / `npx` in shells where those commands are available.

```bash
npm.cmd run dev          # Vite dev server (HMR)
npm.cmd run build        # type-check (tsc -b) + production build to dist/
npm.cmd run preview      # serve the production build locally
npm.cmd run lint         # ESLint
npm.cmd run typecheck    # tsc -b (no emit)
npm.cmd run test         # Vitest (watch)
npm.cmd run test:run     # Vitest (single run, used in CI)
npm.cmd run format       # Prettier write
```

CI: `.github/workflows/web-react-ci.yml` runs lint → type-check → test → build
on any change under `web-react/`.

## Deploy (Cloudflare Pages — production)

The **`ez-vote-react`** Pages project is the production frontend. Its production
deployment serves all of these aliases:

- `https://ez-vote.org` — primary public URL
- `https://next.ez-vote.org` — verification alias
- `https://ez-vote-react.pages.dev` — Pages alias

These are **not separate environments**: they serve the same Pages production deployment
and the same Supabase project. GitHub Actions runs the quality gate but does not deploy.
Release only a clean, current `main` after CI has passed. Authenticate once, then:

```bash
# Auth (one-time): either `npx.cmd wrangler login`, or set
#   CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit + Account: Read) and CLOUDFLARE_ACCOUNT_ID
git switch main
git pull --ff-only
git status --short       # must be empty
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run build
npx.cmd wrangler pages deploy dist --project-name ez-vote-react --branch main
```

`--branch main` is required. Without it, Wrangler can upload a preview deployment that does
not update `ez-vote.org`. The direct-upload release uses the `VITE_SUPABASE_*` values in the
local `web-react/.env` while building `dist/`; ensure they are the production project values.

`public/_redirects` (`/* /index.html 200`) gives the SPA its deep-link fallback
at the edge; `public/_headers` disables caching of `index.html`. Both are copied
into `dist/` by Vite.
