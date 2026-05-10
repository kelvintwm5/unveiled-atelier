// AppShell is the main layout after landing — sidebar on the left, active view on the right.
// It receives the auth state from App and passes what each view needs down as props.

import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import TransactionsView from '../views/TransactionsView'
import ChatView from '../views/ChatView'
import TaxSummaryView from '../views/TaxSummaryView'
import MonthlySummaryView from '../views/MonthlySummaryView'
import type { AuthState } from '../types'

export type View = 'transactions' | 'chat' | 'monthly' | 'tax'

interface AppShellProps {
  auth: AuthState             // 'demo' or 'app' (landing is never passed here)
  onSignOut: () => void
}

export default function AppShell({ auth, onSignOut }: AppShellProps) {
  const [activeView, setActiveView] = useState<View>('transactions')

  // Derive the two things views need from auth state
  const mode        = auth.mode as 'demo' | 'app'
  const accessToken = auth.mode === 'app' ? auth.accessToken : undefined

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">

      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        mode={mode}
        onSignOut={onSignOut}
      />

      <main className="flex-1 overflow-hidden">
        {activeView === 'transactions' && (
          <TransactionsView mode={mode} accessToken={accessToken} />
        )}
        {activeView === 'chat' && <ChatView />}
        {activeView === 'monthly' && (
          <MonthlySummaryView mode={mode} accessToken={accessToken} />
        )}
        {activeView === 'tax' && (
          <TaxSummaryView mode={mode} accessToken={accessToken} />
        )}
      </main>

    </div>
  )
}
