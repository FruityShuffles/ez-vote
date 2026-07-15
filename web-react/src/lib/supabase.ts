import { createClient } from '@supabase/supabase-js'

// Build-time env injection. Vite inlines `import.meta.env.VITE_*` at build,
// mirroring the Flutter app's `--dart-define` of SUPABASE_URL / SUPABASE_ANON_KEY
// (baked into the bundle, not read at runtime). The values come from
// web-react/.env locally and for direct Wrangler production releases. CI uses
// dummy well-formed values because it validates the build without deployment credentials.
//
// Instantiated here in M5 only to lock the env contract — auth wiring is M6.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud at startup rather than producing confusing auth errors later.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

// Auth options are pinned explicitly rather than inherited so the behaviours M6
// depends on are intentional: persistSession + autoRefreshToken keep the user
// signed in across reloads (session persistence), and detectSessionInUrl lets
// the OAuth callback establish the session from the redirect URL. These match
// supabase-js defaults today, but the auth flow relies on them by contract.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
