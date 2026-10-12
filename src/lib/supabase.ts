import { createClient } from '@supabase/supabase-js'

// The anon key is shipped in the JS bundle and is not a secret. It identifies
// the project; it grants nothing on its own. Access is decided entirely by the
// row level security policies in supabase/migrations, which key off the signed-in
// user's email.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Google returns to the app via a full-page redirect, so the session has to
    // be picked back up from the URL and persisted across reloads.
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Scopes for the Google APIs the app calls directly (Sheets for transactions,
// Drive + Docs for invoice generation). Supabase hands this token back as
// session.provider_token.
export const GOOGLE_API_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
].join(' ')

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_API_SCOPES,
      redirectTo: window.location.origin,
      // Forces Google to return a refresh token and re-show consent, which is
      // what makes provider_token reliably present rather than only on first login.
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}
