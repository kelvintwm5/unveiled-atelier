import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import AppShell from './pages/AppShell'
import { onOwnerSessionChange, readAuthRedirectError, signOut } from './lib/supabase'
import type { AuthState } from './types'

// Read once at module load, before the Supabase client is created, so the error
// from a cancelled Google sign-in survives to be shown on the landing page. (Not
// in a useState initializer: StrictMode runs those twice, and this one edits the URL.)
const REDIRECT_ERROR = readAuthRedirectError()

export default function App() {
  // auth is the single source of truth for what state the app is in.
  // Supabase decides 'app' (there is a session) vs 'landing' (there isn't);
  // 'demo' is purely local and never touches Supabase.
  const [auth, setAuth] = useState<AuthState>({ mode: 'landing' })

  // false until Supabase has checked for a saved session (or a ?code= coming back
  // from Google). Without it, a signed-in reload would flash the landing page.
  const [sessionChecked, setSessionChecked] = useState(false)

  const [authError, setAuthError] = useState<string | null>(REDIRECT_ERROR)

  useEffect(() => onOwnerSessionChange(session => {
    setSessionChecked(true)
    setAuth(prev => {
      if (session) return { mode: 'app', email: session.email, googleToken: session.googleToken }
      // A demo visitor has no session; don't throw them back to the landing page.
      return prev.mode === 'demo' ? prev : { mode: 'landing' }
    })
  }), [])

  async function handleSignOut() {
    if (auth.mode !== 'app') {
      setAuth({ mode: 'landing' })
      return
    }
    // On success the SIGNED_OUT event moves us to 'landing'.
    try {
      await signOut()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
      setAuth({ mode: 'landing' })
    }
  }

  if (!sessionChecked) return <div className="min-h-screen bg-stone-950" />

  return (
    <>
      {auth.mode === 'landing' && (
        <LandingPage
          onDemo={() => { setAuthError(null); setAuth({ mode: 'demo' }) }}
          initialError={authError}
        />
      )}

      {(auth.mode === 'demo' || auth.mode === 'app') && (
        <AppShell auth={auth} onSignOut={handleSignOut} />
      )}
    </>
  )
}
