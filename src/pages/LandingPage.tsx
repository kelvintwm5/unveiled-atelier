import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'

interface LandingPageProps {
  onDemo: () => void
  onAuth: (accessToken: string) => void
}

// The Google sign-in button requests read-only access to the user's Google Sheets.
// The access token returned is short-lived (1 hour) and stored only in memory.
const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Live from Google Sheets',
    body:  'Your transactions and totals sync directly from your own spreadsheet.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'IRAS 4-Line Statement',
    body:  'Automatically surfaces the four lines required for Singapore Form B/B1 filing.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: 'Private by design',
    body:  'Sign in with your own Google account. Data is never stored — it lives in memory only.',
  },
]

export default function LandingPage({ onDemo, onAuth }: LandingPageProps) {
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  // useGoogleLogin triggers a Google OAuth popup.
  // flow: 'implicit' returns an access token directly (no backend needed).
  // The token is scoped to read-only Sheets — the user can't accidentally write data.
  const login = useGoogleLogin({
    scope: SHEETS_READONLY_SCOPE,
    onSuccess: tokenResponse => {
      setSigningIn(false)
      onAuth(tokenResponse.access_token)
    },
    onError: () => {
      setSigningIn(false)
      setError('Sign-in failed or was cancelled. Please try again.')
    },
  })

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6">

      {/* Card */}
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-10">
          <p className="text-stone-500 text-xs tracking-widest uppercase mb-3">
            Financial Dashboard
          </p>
          <h1 className="text-white text-4xl font-semibold tracking-tight">
            Unveiled Atelier
          </h1>
          <p className="text-stone-400 text-base mt-3 leading-relaxed">
            A clean financial dashboard for your bridal business,<br />
            powered by Google Sheets.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-4 mb-10">
          {FEATURES.map(({ icon, title, body }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="text-rose-400 mt-0.5 shrink-0">{icon}</div>
              <div>
                <p className="text-stone-200 text-sm font-medium">{title}</p>
                <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">

          {/* Primary — sign in with Google (for the wife's real data) */}
          <button
            onClick={() => { setError(null); setSigningIn(true); login() }}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-stone-100
                       text-stone-800 font-medium text-sm py-3 px-5 rounded-xl
                       transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Google "G" logo */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {signingIn ? 'Opening Google…' : 'Connect with Google'}
          </button>

          {/* Secondary — demo mode (no sign-in) */}
          <button
            onClick={onDemo}
            className="w-full text-stone-400 hover:text-stone-200 text-sm py-3 px-5 rounded-xl
                       border border-stone-800 hover:border-stone-600 transition-colors"
          >
            Try Demo — no sign-in required
          </button>

        </div>

        {/* Error message */}
        {error && (
          <p className="text-red-400 text-xs text-center mt-4">{error}</p>
        )}

        {/* Privacy note */}
        <p className="text-stone-600 text-xs text-center mt-8 leading-relaxed">
          Signing in grants read-only access to Google Sheets.<br />
          Your financial data is never stored or sent to any server.
        </p>

      </div>

    </div>
  )
}
