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

const navItems: NavItem[] = [
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
    id: 'tax',
    label: 'Tax Summary',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
]

export default function Sidebar({ activeView, onNavigate, mode, onSignOut }: SidebarProps) {
  return (
    <aside className="w-60 bg-stone-900 flex flex-col shrink-0">

      {/* Brand + mode badge */}
      <div className="px-6 py-8 border-b border-stone-800">
        <p className="text-stone-500 text-xs tracking-widest uppercase mb-1">Budget</p>
        <h1 className="text-white text-lg font-semibold tracking-wide leading-snug">
          Unveiled<br />Atelier
        </h1>
        {/* Shows whether the user is on demo data or their real live data */}
        <span className={[
          'inline-block mt-3 text-xs font-semibold px-2 py-0.5 rounded-full',
          mode === 'demo'
            ? 'bg-amber-900/50 text-amber-400'
            : 'bg-emerald-900/50 text-emerald-400',
        ].join(' ')}>
          {mode === 'demo' ? 'Demo data' : 'Live data'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const isActive = item.id === activeView
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm',
                'transition-colors duration-150 text-left',
                isActive
                  ? 'bg-rose-900/40 text-rose-200 border border-rose-800/50'
                  : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer — sign out / back to landing */}
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
