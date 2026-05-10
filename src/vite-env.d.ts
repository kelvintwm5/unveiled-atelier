/// <reference types="vite/client" />

// Tells TypeScript about the environment variables Vite exposes via import.meta.env.
// Any variable added to .env with the VITE_ prefix should be declared here.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_REAL_SHEET_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
