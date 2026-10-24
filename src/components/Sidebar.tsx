import type { View } from '../pages/AppShell'

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
  mode: 'demo' | 'app'
  onSignOut: () => void
}

interface NavItem {
  id: View
  label: string
  icon: JSX.Element
}

const BUDGET_NAV: NavItem[] = [
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
    id: 'monthly',
    label: 'Monthly Summary',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'tax',
    label: 'Tax Summary',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'invoices',
    label: 'Invoice Generator',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing Calculator',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
]

const CLIENT_NAV: NavItem[] = [
  {
    id: 'client-dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'client-chat',
    label: 'Chat',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
]

export default function Sidebar({ activeView, onNavigate, mode, onSignOut }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-60 bg-stone-900 flex-col shrink-0">

      {/* Brand + mode badge */}
      <div className="px-6 pt-7 pb-5 border-b border-stone-800">
        <div className="flex flex-col items-center text-center mb-3">
          <span
            style={{ fontFamily: "'Pinyon Script', cursive", fontSize: '2.6rem', lineHeight: 1.1 }}
            className="text-stone-200 leading-none"
          >
            Unveiled
          </span>
          <span
            style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.3em', fontSize: '0.65rem' }}
            className="text-stone-400 uppercase mt-1"
          >
            Atelier
          </span>
          <span
            style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.25em', fontSize: '0.55rem' }}
            className="text-stone-500 uppercase mt-0.5"
          >
            by Esther
          </span>
        </div>
        <div className="flex justify-center">
          <span className={[
            'inline-block text-xs font-semibold px-2 py-0.5 rounded-full',
            mode === 'demo'
              ? 'bg-amber-900/50 text-amber-400'
              : 'bg-emerald-900/50 text-emerald-400',
          ].join(' ')}>
            {mode === 'demo' ? 'Demo data' : 'Live data'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <SectionLabel>Budget</SectionLabel>
        <div className="space-y-1 mt-1">
          {BUDGET_NAV.map(item => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onNavigate={onNavigate} />
          ))}
        </div>

        <SectionLabel className="mt-5">Clients</SectionLabel>
        <div className="space-y-1 mt-1">
          {CLIENT_NAV.map(item => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-stone-800 space-y-2">
        <p className="text-stone-600 text-xs px-3">Singapore · IRAS Filing</p>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                     text-stone-500 hover:bg-stone-800 hover:text-stone-300
                     transition-colors text-left"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {mode === 'demo' ? 'Back to home' : 'Sign out'}
        </button>
      </div>

    </aside>
  )
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold text-stone-600 uppercase tracking-wider px-3 mb-1 ${className}`}>
      {children}
    </p>
  )
}

function NavButton({ item, active, onNavigate }: {
  item: NavItem
  active: boolean
  onNavigate: (view: View) => void
}) {
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm',
        'transition-colors duration-150 text-left',
        active
          ? 'bg-rose-900/40 text-rose-200 border border-rose-800/50'
          : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200',
      ].join(' ')}
    >
      {item.icon}
      {item.label}
    </button>
  )
}
