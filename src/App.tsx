import { useState } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import LandingPage from './pages/LandingPage'
import AppShell from './pages/AppShell'
import type { AuthState } from './types'

// The OAuth Client ID identifies this app to Google.
// Unlike an API key, this is NOT a secret — it's safe in source code.
// It's in .env so it's easy to change without touching source files.
// Falls back to a placeholder so the page renders even before .env is set up.
// The "Connect with Google" button will simply not work until a real ID is provided.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? 'not-configured'

export default function App() {
  // auth is the single source of truth for what state the app is in.
  // It starts at 'landing' and transitions to 'demo' or 'app' based on user action.
  const [auth, setAuth] = useState<AuthState>({ mode: 'landing' })

  return (
    // GoogleOAuthProvider must wrap any component that uses useGoogleLogin.
    // The clientId tells Google which app is requesting access.
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>

      {auth.mode === 'landing' && (
        <LandingPage
          onDemo={() => setAuth({ mode: 'demo' })}
          onAuth={token  => setAuth({ mode: 'app', accessToken: token })}
        />
      )}

      {(auth.mode === 'demo' || auth.mode === 'app') && (
        <AppShell
          auth={auth}
          onSignOut={() => setAuth({ mode: 'landing' })}
        />
      )}

    </GoogleOAuthProvider>
  )
}
