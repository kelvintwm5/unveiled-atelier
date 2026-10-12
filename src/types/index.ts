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

// ── Client tracker shapes ─────────────────────────────────────────────────────

export type ClientStage = 'Inquiry' | 'Consultation' | 'Fitting' | 'Confirmed' | 'Completed' | 'Lost'
export type VeilType = 'Rental' | 'Bespoke Veil' | 'Bespoke Rental' | 'TBD'
export type ActivityType = 'Call' | 'WhatsApp' | 'Email' | 'In-Person' | 'Note'

export interface Client {
  name: string
  email: string
  phone: string
  weddingDate: string    // YYYY-MM-DD
  veilType: VeilType
  budget: number         // SGD
  stage: ClientStage
  notes: string
}

export interface ClientActivity {
  date: string           // YYYY-MM-DD
  clientName: string
  type: ActivityType
  notes: string
  nextFollowUp: string   // YYYY-MM-DD or ''
}

// ── Auth shapes ───────────────────────────────────────────────────────────────

// The app is always in one of three states:
//   landing   → showing the landing page, no data loaded
//   demo      → visitor using sample data, no sign-in required
//   app       → owner signed in to Supabase with Google
export type AuthMode = 'landing' | 'demo' | 'app'

// googleToken is Google's access token for the legacy Sheets/Docs code, not the
// Supabase session token. It is null once it has expired (see OwnerSession).
export type AuthState =
  | { mode: 'landing' }
  | { mode: 'demo' }
  | { mode: 'app'; email: string; googleToken: string | null }
