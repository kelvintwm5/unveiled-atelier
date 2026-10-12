import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The anon key is shipped in the JS bundle and is not a secret. It identifies
// the project; it grants nothing on its own. Access is decided entirely by the
// row level security policies in supabase/migrations, which key off the signed-in
// user's email.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Created lazily so that a missing .env breaks owner sign-in with a readable
// message instead of blanking the whole page. Demo mode never needs a client.
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // PKCE brings back a one-time code in the URL instead of the tokens
      // themselves. The default (implicit) puts the session and the Google token
      // in the URL hash, where they end up in browser history.
      flowType: 'pkce',
      // Google returns to the app via a full-page redirect, so the session has to
      // be picked back up from the URL and persisted across reloads.
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return client
}

const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Scopes for the Google APIs the legacy code still calls directly (Sheets for
// transactions and clients, Drive + Docs for invoice generation). Supabase hands
// this token back once, as session.provider_token. Remove these scopes when the
// last Sheets/Docs/Drive code is gone.
export const GOOGLE_API_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
].join(' ')

/**
 * Sends the browser to Google, then back to this origin via Supabase.
 * On success the page navigates away, so the returned promise rarely matters.
 *
 * No access_type=offline: nothing server-side uses a Google refresh token, and
 * supabase-js would otherwise keep one (with full Drive access) in localStorage.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_API_SCOPES,
      redirectTo: window.location.origin,
    },
  })
  if (error) throw new Error(`Couldn't start Google sign-in: ${error.message}`)
}

/** Signs out on this device only; Esther's phone stays signed in. */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' })
  if (error) throw new Error(`Couldn't sign out: ${error.message}`)
}

export interface OwnerSession {
  email: string
  // Google's access token for the legacy Sheets/Docs code. Supabase never
  // refreshes it: the next refresh of the Supabase session (about hourly, the same
  // lifetime as the Google token) drops it. null means "reconnect Google".
  googleToken: string | null
}

/**
 * Calls back with the current session straight away (INITIAL_SESSION), then on
 * every sign-in, refresh and sign-out. Returns an unsubscribe function.
 */
export function onOwnerSessionChange(cb: (session: OwnerSession | null) => void): () => void {
  if (!isConfigured) {
    cb(null)
    return () => {}
  }
  // Kept synchronous: awaiting other supabase calls inside this callback can
  // deadlock on the auth lock.
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    cb(session
      ? { email: session.user.email ?? '', googleToken: session.provider_token ?? null }
      : null)
  })
  return () => data.subscription.unsubscribe()
}

/**
 * A failed or cancelled Google redirect comes back as ?error_description=… (or
 * in the hash). supabase-js swallows it, so read it here and tidy the URL.
 */
export function readAuthRedirectError(): string | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const message = query.get('error_description') ?? hash.get('error_description')
  if (!message) return null
  window.history.replaceState(window.history.state, '', window.location.pathname)
  return message
}
