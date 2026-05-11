import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import TransactionsView from '../views/TransactionsView'
import ChatView from '../views/ChatView'
import TaxSummaryView from '../views/TaxSummaryView'
import MonthlySummaryView from '../views/MonthlySummaryView'
import InvoiceView from '../views/InvoiceView'
import type { AuthState } from '../types'

export type View = 'transactions' | 'chat' | 'monthly' | 'tax' | 'invoices'

interface AppShellProps {
  auth: AuthState
  onSignOut: () => void
}

const MOBILE_NAV: { id: View; label: string; icon: JSX.Element }[] = [
  {
    id: 'transactions',
    label: 'Transactions',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: 'monthly',
    label: 'Monthly',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'tax',
    label: 'Tax',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

export default function AppShell({ auth, onSignOut }: AppShellProps) {
  const [activeView, setActiveView] = useState<View>('transactions')

  const mode        = auth.mode as 'demo' | 'app'
  const accessToken = auth.mode === 'app' ? auth.accessToken : undefined

  return (
    <div className="flex h-[100dvh] bg-stone-50 overflow-hidden">

      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        mode={mode}
        onSignOut={onSignOut}
      />

      <div className="flex-1 flex flex-col min-h-0">

        {/* Mobile top bar */}
        <div className="md:hidden bg-stone-900 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex flex-col leading-none">
            <span
              style={{ fontFamily: "'Pinyon Script', cursive", fontSize: '1.6rem', lineHeight: 1 }}
              className="text-stone-200"
            >
              Unveiled
            </span>
            <span
              style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.25em', fontSize: '0.55rem' }}
              className="text-stone-400 uppercase mt-0.5"
            >
              Atelier · by Esther
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={[
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              mode === 'demo' ? 'bg-amber-900/50 text-amber-400' : 'bg-emerald-900/50 text-emerald-400',
            ].join(' ')}>
              {mode === 'demo' ? 'Demo' : 'Live'}
            </span>
            <button
              onClick={onSignOut}
              aria-label={mode === 'demo' ? 'Back to home' : 'Sign out'}
              className="text-stone-400 hover:text-stone-200 transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-hidden min-h-0">
          {activeView === 'transactions' && (
            <TransactionsView mode={mode} accessToken={accessToken} />
          )}
          {activeView === 'chat' && <ChatView mode={mode} accessToken={accessToken} />}
          {activeView === 'monthly' && (
            <MonthlySummaryView mode={mode} accessToken={accessToken} />
          )}
          {activeView === 'tax' && (
            <TaxSummaryView mode={mode} accessToken={accessToken} />
          )}
          {activeView === 'invoices' && (
            <InvoiceView mode={mode} accessToken={accessToken} />
          )}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden bg-stone-900 border-t border-stone-800 flex shrink-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {MOBILE_NAV.map(item => {
            const isActive = item.id === activeView
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={[
                  'flex-1 flex flex-col items-center gap-1 py-2.5 px-1 transition-colors',
                  isActive ? 'text-rose-300' : 'text-stone-500 hover:text-stone-300',
                ].join(' ')}
              >
                {item.icon}
                <span className="text-xs leading-none">{item.label}</span>
              </button>
            )
          })}
        </nav>

      </div>

    </div>
  )
}
