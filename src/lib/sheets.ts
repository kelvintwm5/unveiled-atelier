// All Google Sheets API communication lives here.
// Views never call fetch() directly — they import from this file.
//
// Two modes:
//   demo → returns hardcoded sample data instantly, no network call
//   app  → fetches from Google Sheets using a short-lived OAuth access token
//          (token comes from the user signing in — never stored, lives in memory only)

import type { Transaction, IrasSummary, MonthlySummary } from '../types'
import { DEMO_TRANSACTIONS, DEMO_IRAS, DEMO_MONTHLY } from './demoData'

// The real sheet ID — only used when the user is authenticated.
// Stored in .env so it's not hardcoded in source code published to GitHub.
const REAL_SHEET_ID = import.meta.env.VITE_REAL_SHEET_ID as string

/** Format a number as Singapore dollars: 3800 → "S$3,800.00" */
export function formatSGD(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

/**
 * Core fetch helper for the Sheets API.
 * Uses an OAuth Bearer token instead of an API key — the token is scoped to
 * read-only Sheets access and expires in 1 hour, so a leaked token is harmless after that.
 */
async function getRange(
  range: string,
  accessToken: string
): Promise<(string | number)[][]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/${encodeURIComponent(range)}`
  )
  // UNFORMATTED_VALUE returns raw numbers (3800) not display strings ("S$3,800.00")
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) {
    throw new Error('Session expired — please sign in again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Sheets API returned HTTP ${res.status}`)
  }

  const data = await res.json()
  return data.values ?? []
}

/** Fetch all transactions. Returns demo data or live data depending on mode. */
export async function fetchTransactions(
  mode: 'demo' | 'app',
  accessToken?: string
): Promise<Transaction[]> {
  if (mode === 'demo') return DEMO_TRANSACTIONS

  const rows = await getRange('Transactions!A2:I', accessToken!)
  return rows
    .filter(row => row[0])
    .map(row => ({
      date:          String(row[0] ?? ''),
      type:          String(row[1] ?? '') as 'Income' | 'Expense',
      description:   String(row[2] ?? ''),
      category:      String(row[3] ?? ''),
      amount:        Number(row[4])  || 0,
      paymentMethod: String(row[5] ?? ''),
      clientName:    String(row[6] ?? ''),
      receiptNo:     String(row[7] ?? ''),
      notes:         String(row[8] ?? ''),
    }))
}

/** Fetch all 12 monthly summary rows. Returns demo data or live data depending on mode. */
export async function fetchMonthlySummary(
  mode: 'demo' | 'app',
  accessToken?: string
): Promise<MonthlySummary[]> {
  if (mode === 'demo') return DEMO_MONTHLY

  const rows = await getRange("'Monthly Summary'!A2:E13", accessToken!)
  return rows.map(row => ({
    month:         String(row[0] ?? ''),
    income:        Number(row[1]) || 0,
    expenses:      Number(row[2]) || 0,
    netProfit:     Number(row[3]) || 0,
    profitMargin:  Number(row[4]) || 0,
  }))
}

/** Fetch the 4 IRAS line totals. Returns demo data or live data depending on mode. */
export async function fetchIrasSummary(
  mode: 'demo' | 'app',
  accessToken?: string
): Promise<IrasSummary> {
  if (mode === 'demo') return DEMO_IRAS

  // C5:C8 on the IRAS tab holds the four formula-computed values
  const rows = await getRange("'IRAS 4-Line Statement'!C5:C8", accessToken!)
  return {
    revenue:        Number(rows[0]?.[0]) || 0,
    grossProfit:    Number(rows[1]?.[0]) || 0,
    expenses:       Number(rows[2]?.[0]) || 0,
    adjustedProfit: Number(rows[3]?.[0]) || 0,
  }
}
