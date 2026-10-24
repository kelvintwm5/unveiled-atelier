// All P&L data access lives here: the transaction ledger and the monthly and IRAS
// totals. Views call these functions and never see the Supabase client or the
// database's snake_case column names.
//   demo → the fixtures in demoData.ts; no network, and read-only
//   app  → the transactions table and the 0005 SQL functions, guarded by RLS
//
// Totals are summed by Postgres (pnl_monthly, iras_summary), never here. JS numbers
// are binary floats, where 0.1 + 0.2 is 0.30000000000000004; Postgres numeric is
// exact. The Number() calls below only turn the database's exact decimals into
// something to display, and nothing adds them up afterwards.
//
// Demo mode is read-only on purpose: an added row would leave the precomputed demo
// totals wrong, and fixing that would mean doing the money maths in JS after all.

import { getSupabase } from './supabase'
import { todaySgt } from './dates'
import { DEMO_IRAS, DEMO_MONTHLY, DEMO_PNL_TOTAL, DEMO_PNL_YEAR, DEMO_TRANSACTIONS } from './demoData'
import type { IrasSummary, MonthlyPnl, MonthlySummary, NewTransaction, PnlTotals, Transaction } from '../types'

type Mode = 'demo' | 'app'

const DEMO_READ_ONLY = 'The demo is read-only. Sign in to record transactions.'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Row mapping ────────────────────────────────────────────────────────────────

// numeric columns: PostgREST may send them as strings to keep every digit.
type Numeric = number | string

interface TransactionRow {
  id: string
  transaction_date: string
  type: Transaction['type']
  amount: Numeric
  category: string | null
  description: string
  payment_method: string | null
  client_name: string | null
  client_id: string | null
  reference_no: string | null
  notes: string | null
}

interface PnlMonthRow {
  month: number | null   // null on the year-total row
  income: Numeric
  expenses: Numeric
  net_profit: Numeric
  profit_margin: Numeric
}

interface IrasRow {
  revenue: Numeric
  gross_profit: Numeric
  allowable_expenses: Numeric
  adjusted_profit: Numeric
}

const TRANSACTION_COLUMNS =
  'id, transaction_date, type, amount, category, description, payment_method, client_name, client_id, reference_no, notes'

function toTransaction(r: TransactionRow): Transaction {
  return {
    id:            r.id,
    date:          r.transaction_date,
    type:          r.type,
    amount:        Number(r.amount),
    category:      r.category ?? '',
    description:   r.description,
    paymentMethod: r.payment_method ?? '',
    clientName:    r.client_name ?? '',
    clientId:      r.client_id ?? '',
    referenceNo:   r.reference_no ?? '',
    notes:         r.notes ?? '',
  }
}

function fromNewTransaction(t: NewTransaction) {
  return {
    transaction_date: t.date,
    type:             t.type,
    amount:           t.amount,
    category:         t.category.trim() || null,
    description:      t.description.trim(),
    payment_method:   t.paymentMethod.trim() || null,
    client_name:      t.clientName.trim() || null,
    client_id:        t.clientId || null,
    reference_no:     t.referenceNo.trim() || null,
    notes:            t.notes.trim() || null,
  }
}

function toTotals(r: PnlMonthRow): PnlTotals {
  return {
    income:       Number(r.income),
    expenses:     Number(r.expenses),
    netProfit:    Number(r.net_profit),
    profitMargin: Number(r.profit_margin),
  }
}

const ZERO_TOTALS: PnlTotals = { income: 0, expenses: 0, netProfit: 0, profitMargin: 0 }

// ── Ledger ─────────────────────────────────────────────────────────────────────

/** Newest first. */
export async function listTransactions(mode: Mode): Promise<Transaction[]> {
  if (mode === 'demo') {
    return DEMO_TRANSACTIONS.map(t => ({ ...t })).sort((a, b) => b.date.localeCompare(a.date))
  }
  const { data, error } = await getSupabase()
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Couldn't load transactions: ${error.message}`)
  return (data as TransactionRow[]).map(toTransaction)
}

/** Saves a new transaction and returns it with the id the database assigned. */
export async function createTransaction(mode: Mode, input: NewTransaction): Promise<Transaction> {
  if (!input.date) throw new Error('Date is required.')
  if (!input.description.trim()) throw new Error('Description is required.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Amount must be more than zero.')
  // The column keeps 2 decimal places and would silently round anything finer.
  if (Math.round(input.amount * 100) / 100 !== input.amount) {
    throw new Error('Amounts can have at most 2 decimal places.')
  }
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)

  const { data, error } = await getSupabase()
    .from('transactions')
    .insert(fromNewTransaction(input))
    .select(TRANSACTION_COLUMNS)
    .single()
  if (error) throw new Error(`Couldn't save the transaction: ${error.message}`)
  return toTransaction(data as TransactionRow)
}

export async function deleteTransaction(mode: Mode, id: string): Promise<void> {
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)
  // .select() makes the delete report which rows it removed. Without it, an id
  // that no longer exists (or that RLS hides) "succeeds" while removing nothing.
  const { data, error } = await getSupabase()
    .from('transactions')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw new Error(`Couldn't delete the transaction: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't delete the transaction: it no longer exists. Reload the page.")
}

// ── Totals ─────────────────────────────────────────────────────────────────────

/** Years that have transactions, newest first. */
export async function listTransactionYears(mode: Mode): Promise<number[]> {
  if (mode === 'demo') return [DEMO_PNL_YEAR]
  const { data, error } = await getSupabase().rpc('transaction_years')
  if (error) throw new Error(`Couldn't load the list of years: ${error.message}`)
  return (data as { year: number }[]).map(r => r.year)
}

/** The year a P&L screen opens on: the latest with data, or this year in Singapore. */
export function defaultYear(years: number[]): number {
  return years[0] ?? Number(todaySgt().slice(0, 4))
}

/** Income, expenses and profit for each month of one calendar year, plus the year total. */
export async function getMonthlyPnl(mode: Mode, year: number): Promise<MonthlyPnl> {
  if (mode === 'demo') {
    return year === DEMO_PNL_YEAR
      ? { year, months: DEMO_MONTHLY.map(m => ({ ...m })), total: { ...DEMO_PNL_TOTAL } }
      : { year, months: MONTH_NAMES.map(month => ({ month, ...ZERO_TOTALS })), total: { ...ZERO_TOTALS } }
  }
  const { data, error } = await getSupabase().rpc('pnl_monthly', { p_year: year })
  if (error) throw new Error(`Couldn't load the monthly summary: ${error.message}`)

  const rows = data as PnlMonthRow[]
  const months: MonthlySummary[] = rows
    .filter((r): r is PnlMonthRow & { month: number } => r.month !== null)
    .map(r => ({ month: MONTH_NAMES[r.month - 1], ...toTotals(r) }))
  const totalRow = rows.find(r => r.month === null)
  if (months.length !== 12 || !totalRow) {
    throw new Error("The monthly summary came back incomplete. Check that migration 0005 is applied.")
  }
  return { year, months, total: toTotals(totalRow) }
}

/** The IRAS 4-line statement for one calendar year. A reporting aid, not tax advice. */
export async function getIrasSummary(mode: Mode, year: number): Promise<IrasSummary> {
  if (mode === 'demo') {
    return year === DEMO_PNL_YEAR
      ? { ...DEMO_IRAS }
      : { revenue: 0, grossProfit: 0, expenses: 0, adjustedProfit: 0 }
  }
  const { data, error } = await getSupabase().rpc('iras_summary', { p_year: year }).single()
  if (error) throw new Error(`Couldn't load the tax summary: ${error.message}`)
  const r = data as IrasRow
  return {
    revenue:        Number(r.revenue),
    grossProfit:    Number(r.gross_profit),
    expenses:       Number(r.allowable_expenses),
    adjustedProfit: Number(r.adjusted_profit),
  }
}
