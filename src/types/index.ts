// ── Data shapes ───────────────────────────────────────────────────────────────

// id is the database uuid. amount is always positive: type says which way the
// money moved. Text fields the database stores as null arrive here as ''.
export interface Transaction {
  id: string
  date: string             // YYYY-MM-DD, a Singapore calendar date
  type: 'Income' | 'Expense'
  description: string
  category: string
  amount: number           // SGD, e.g. 3800
  paymentMethod: string
  clientName: string       // as it was on the day; also used for people not in the tracker
  clientId: string         // Client.id, or '' when not linked to a tracked client
  referenceNo: string      // receipt or invoice number
  notes: string
}

export type NewTransaction = Omit<Transaction, 'id'>

// The four lines of the IRAS Form B/B1 statement for one calendar year.
export interface IrasSummary {
  revenue: number
  grossProfit: number
  expenses: number
  adjustedProfit: number
}

export interface PnlTotals {
  income: number
  expenses: number
  netProfit: number
  profitMargin: number  // decimal: 0.25 = 25%; 0 when there is no income
}

// One month of one year
export interface MonthlySummary extends PnlTotals {
  month: string         // 'January'
}

// A calendar year, every figure summed by the database
export interface MonthlyPnl {
  year: number
  months: MonthlySummary[]   // always 12, January first
  total: PnlTotals
}

// ── Client tracker shapes ─────────────────────────────────────────────────────

export type ClientStage = 'Inquiry' | 'Consultation' | 'Fitting' | 'Confirmed' | 'Completed' | 'Lost'
export type VeilType = 'Rental' | 'Bespoke Veil' | 'Bespoke Rental' | 'TBD'
export type ActivityType = 'Call' | 'WhatsApp' | 'Email' | 'In-Person' | 'Note'

// id is the database uuid. Records are linked by id, never by name: two
// clients can share a name, and a name can be corrected later.
export interface Client {
  id: string
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
  id: string
  clientId: string       // Client.id
  date: string           // YYYY-MM-DD
  type: ActivityType
  notes: string
  nextFollowUp: string   // YYYY-MM-DD or ''
}

// What the add forms produce: the database assigns the id.
export type NewClient = Omit<Client, 'id'>
export type NewActivity = Omit<ClientActivity, 'id'>

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
