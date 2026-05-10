// ── Data shapes ───────────────────────────────────────────────────────────────

export interface Transaction {
  date: string
  type: 'Income' | 'Expense'
  description: string
  category: string
  amount: number           // raw SGD number e.g. 3800
  paymentMethod: string
  clientName: string
  receiptNo: string
  notes: string
}

export interface IrasSummary {
  revenue: number
  grossProfit: number
  expenses: number
  adjustedProfit: number
}

// One row from the Monthly Summary tab
export interface MonthlySummary {
  month: string
  income: number
  expenses: number
  netProfit: number
  profitMargin: number  // decimal: 0.25 = 25%
}

// ── Auth shapes ───────────────────────────────────────────────────────────────

// The app is always in one of three states:
//   landing   → showing the landing page, no data loaded
//   demo      → visitor using sample data, no sign-in required
//   app       → wife signed in with Google, reading real private sheet
export type AuthMode = 'landing' | 'demo' | 'app'

export type AuthState =
  | { mode: 'landing' }
  | { mode: 'demo' }
  | { mode: 'app'; accessToken: string }  // token lives in memory only, never persisted
