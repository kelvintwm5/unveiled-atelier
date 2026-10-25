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

// ── Invoice shapes ────────────────────────────────────────────────────────────

// Must match the check constraints in supabase/migrations/0006_invoices.sql.
export type InvoiceTemplate = 'rental' | 'bespoke'
export type InvoiceKind = 'deposit' | 'final'
export type InvoiceStatus = 'draft' | 'issued' | 'void'

export interface InvoiceLine {
  title: string
  description: string    // plain text; lines starting with "- " print as bullets
  quantity: number       // whole units, at least 1
  unitAmount: number     // SGD per unit; the line total is quantity × unitAmount
}

// One row of the totals block under the line items. The last row is the amount
// payable now.
export interface TotalsRow {
  label: string
  amount: number         // SGD
  bold: boolean
}

// What the invoice editor edits. Every field is copied onto the invoice, so later
// changes to the client record or the settings never alter an issued invoice.
export interface InvoiceDraft {
  template: InvoiceTemplate
  kind: InvoiceKind
  clientId: string           // Client.id, or '' when not linked to the tracker
  clientName: string
  clientEmail: string
  clientPhone: string
  pwsDate: string            // YYYY-MM-DD or ''
  weddingDate: string        // YYYY-MM-DD or ''
  clientNote: string
  terms: string
  depositInvoiceId: string   // final only: the issued deposit invoice it settles, or ''
  legacyDepositNo: string    // final only: a deposit number from before the app, or ''
  replacesInvoiceId: string  // set on a draft that will replace an issued invoice, or ''
  lines: InvoiceLine[]
}

// The business details printed on an invoice, as they were when it was issued.
export interface BusinessDetails {
  businessName: string
  address: string
  email: string
  phone: string
  paynow: string
  bankName: string
  bankAccountName: string
  bankAccountNo: string
}

export interface InvoiceSettings extends BusinessDetails {
  defaultTermsRental: string
  defaultTermsBespoke: string
}

// Fields after the draft ones are set by the database when the invoice is issued
// (or voided), and are '' / null / 0 on a draft.
export interface Invoice extends InvoiceDraft {
  id: string
  status: InvoiceStatus
  invoiceNo: string          // UA-YYYY-NNNN, '' on a draft
  issuedOn: string           // YYYY-MM-DD in Singapore, '' on a draft
  subtotal: number | null
  amountPayable: number | null
  totals: TotalsRow[] | null
  business: BusinessDetails | null
  pdfPath: string
  voidedAt: string           // ISO timestamp, '' unless void
  voidReason: string
  createdAt: string
}

// Everything an invoice PDF prints, already worked out. A draft's comes from the
// form plus today's settings; an issued invoice's only from its frozen fields, so
// redrawing it reproduces what the client received.
export interface InvoiceRender {
  invoiceNo: string          // '' for a draft
  date: string               // YYYY-MM-DD: the issue date, or today for a draft
  template: InvoiceTemplate
  kind: InvoiceKind
  business: BusinessDetails
  clientName: string
  clientEmail: string
  clientPhone: string
  pwsDate: string
  weddingDate: string
  clientNote: string
  lines: InvoiceLine[]
  totals: TotalsRow[]        // the last row is the amount payable now
  terms: string
  settles: string            // the deposit invoice number a final settles, or ''
  replaces: string           // the invoice number this one replaces, or ''
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
