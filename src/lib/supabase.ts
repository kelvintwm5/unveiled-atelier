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
      // themselves. The default (implicit) puts the session in the URL hash, where
      // it ends up in browser history.
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

/**
 * Sends the browser to Google, then back to this origin via Supabase.
 * On success the page navigates away, so the returned promise rarely matters.
 *
 * Google is only used to prove who is signing in. No extra scopes are requested,
 * so Google asks for nothing beyond name, email and profile picture, and the app
 * gets no access to Esther's Drive, Docs or Sheets. Everything else is in Supabase.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
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
    cb(session ? { email: session.user.email ?? '' } : null)
  })
  return () => data.subscription.unsubscribe()
}

/**
 * Asks the database whether the signed-in user is in app_owners. This is the same
 * is_app_owner() the RLS policies use, so the UI and the data can't disagree
 * about who is an owner. It only decides what the UI shows; RLS still guards the data.
 */
export async function isAppOwner(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_app_owner')
  if (error) throw new Error(`Couldn't check your access: ${error.message}`)
  return data === true
}

/**
 * The Supabase access token (a JWT) for calls to our own /api functions, which
 * verify it before doing anything. supabase-js keeps it fresh.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession()
  if (error) throw new Error(`Couldn't read your session: ${error.message}`)
  return data.session?.access_token ?? null
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
