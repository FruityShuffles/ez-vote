/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // ESM-safe absolute path to src/ (avoids the CJS __dirname global).
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The shared ballot-derivation module (M23) lives with the edge functions
      // so both stacks derive identically. M10 imports it in place — one source
      // of truth, no vendored copy — via this alias.
      '@shared': fileURLToPath(
        new URL('../supabase/functions/_shared', import.meta.url),
      ),
    },
  },
  server: {
    // Allow Vite to serve the sibling `supabase/functions/_shared` dir, which is
    // outside this project root (the `@shared` import above).
    fs: { allow: ['..'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    // Playwright owns the browser specs under e2e/. Without this boundary,
    // Vitest imports them as unit tests and fails before the React suite runs.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Dummy Supabase env for tests. `src/lib/supabase.ts` fails loud when these
    // are unset, so any suite whose import graph reaches the client needs them —
    // this makes the suite run with no local `.env` and no CI secrets (the CI
    // `test:run` step has none; only `build` gets dummies). The client is
    // constructed but never hits the network in tests.
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
