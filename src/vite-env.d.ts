/// <reference types="vite/client" />

// Tells TypeScript about the environment variables Vite exposes via import.meta.env.
// Any variable added to .env with the VITE_ prefix should be declared here.
interface ImportMetaEnv {
  readonly VITE_REAL_SHEET_ID: string
  // Optional in the type so lib/supabase.ts has to handle a missing .env.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
