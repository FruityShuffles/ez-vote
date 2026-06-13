/// <reference types="vite/client" />

// Types the build-time Supabase env vars (see src/lib/supabase.ts).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
