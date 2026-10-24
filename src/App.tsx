import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import AppShell from './pages/AppShell'
import { isAppOwner, onOwnerSessionChange, readAuthRedirectError, signOut, type OwnerSession } from './lib/supabase'
import type { AuthState } from './types'

// Read once at module load, before the Supabase client is created, so the error
// from a cancelled Google sign-in survives to be shown on the landing page. (Not
// in a useState initializer: StrictMode runs those twice, and this one edits the URL.)
const REDIRECT_ERROR = readAuthRedirectError()

export default function App() {
  // false until Supabase has checked for a saved session (or a ?code= coming back
  // from Google). Without it, a signed-in reload would flash the landing page.
  const [sessionChecked, setSessionChecked] = useState(false)

  // The session Supabase reports. Having one only proves someone signed in with
  // Google; any Google account can do that.
  const [session, setSession] = useState<OwnerSession | null>(null)

  // The email that passed is_app_owner(). Hourly token refreshes for the same
  // email skip the check, so they don't blank the screen or cost a round trip.
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)

  // An email whose check failed or was refused. Stops the check looping and
  // stops the blank "checking" screen hiding the error.
  const [rejectedEmail, setRejectedEmail] = useState<string | null>(null)

  // 'demo' is purely local and never touches Supabase.
  const [demo, setDemo] = useState(false)

  const [authError, setAuthError] = useState<string | null>(REDIRECT_ERROR)

  // Kept synchronous (see onOwnerSessionChange): the owner check runs in the
  // effect below instead of inside this callback.
  useEffect(() => onOwnerSessionChange(s => {
    setSessionChecked(true)
    setSession(s)
  }), [])

  const sessionEmail = session?.email ?? null

  useEffect(() => {
    if (!sessionEmail || sessionEmail === verifiedEmail || sessionEmail === rejectedEmail) return
    let cancelled = false
    isAppOwner()
      .then(async isOwner => {
        if (cancelled) return
        if (isOwner) {
          setVerifiedEmail(sessionEmail)
          return
        }
        // Set before signing out: LandingPage reads its error once, when it mounts.
        setAuthError(`${sessionEmail} isn't set up as an owner of Unveiled Atelier. Ask Kelvin to add it.`)
        setRejectedEmail(sessionEmail)
        await signOut()
      })
      .catch(err => {
        if (cancelled) return
        // Not signed out: the session may be fine and the network not, so a
        // reload simply tries again.
        setAuthError(err instanceof Error ? err.message : String(err))
        setRejectedEmail(sessionEmail)
      })
    return () => { cancelled = true }
  }, [sessionEmail, verifiedEmail, rejectedEmail])

  // auth is derived, not stored, so there's no render where the session has been
  // verified but the app still shows the landing page (or the other way round).
  const auth: AuthState = session && session.email === verifiedEmail
    ? { mode: 'app', email: session.email, googleToken: session.googleToken }
    : demo ? { mode: 'demo' } : { mode: 'landing' }

  const checkingOwner = sessionEmail !== null
    && sessionEmail !== verifiedEmail
    && sessionEmail !== rejectedEmail

  async function handleSignOut() {
    if (auth.mode !== 'app') {
      setDemo(false)
      return
    }
    // On success the SIGNED_OUT event clears the session.
    try {
      await signOut()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
      setSession(null)
    }
  }

  if (!sessionChecked || checkingOwner) return <div className="min-h-screen bg-stone-950" />

  return (
    <>
      {auth.mode === 'landing' && (
        <LandingPage
          onDemo={() => { setAuthError(null); setDemo(true) }}
          initialError={authError}
        />
      )}

      {(auth.mode === 'demo' || auth.mode === 'app') && (
        <AppShell auth={auth} onSignOut={handleSignOut} />
      )}
    </>
  )
}
