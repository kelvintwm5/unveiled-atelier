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
import type {
  IrasSummary, MonthlyPnl, MonthlySummary, NewTransaction, PnlTotals, Transaction, TransactionAttachment,
} from '../types'

type Mode = 'demo' | 'app'

const DEMO_READ_ONLY = 'The demo is read-only. Sign in to record transactions.'

// The private Storage bucket from 0010. Its size and type limits are repeated
// here only to give a friendly message before a slow upload; the bucket is what
// actually enforces them.
const ATTACHMENT_BUCKET = 'transaction-files'
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/heic':      'heic',
  'image/heif':      'heif',
  'application/pdf': 'pdf',
}

const TYPE_FOR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
}

/** What should happen to a transaction's file when an edit is saved. */
export type AttachmentChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; file: File }

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
  attachment_path: string | null
  attachment_name: string | null
  source: string | null
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
  'id, transaction_date, type, amount, category, description, payment_method, client_name, client_id, reference_no, notes, attachment_path, attachment_name, source'

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
    attachment:    r.attachment_path ? { path: r.attachment_path, name: r.attachment_name ?? '' } : undefined,
    fromInvoice:   r.source !== null,
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

function validateTransaction(input: NewTransaction): void {
  if (!input.date) throw new Error('Date is required.')
  if (!input.description.trim()) throw new Error('Description is required.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Amount must be more than zero.')
  // The column keeps 2 decimal places and would silently round anything finer.
  if (Math.round(input.amount * 100) / 100 !== input.amount) {
    throw new Error('Amounts can have at most 2 decimal places.')
  }
}

function attachmentColumns(attachment: TransactionAttachment | null) {
  return { attachment_path: attachment?.path ?? null, attachment_name: attachment?.name ?? null }
}

/** Saves a new transaction, with its file if there is one, and returns it with the id the database assigned. */
export async function createTransaction(mode: Mode, input: NewTransaction, file?: File): Promise<Transaction> {
  validateTransaction(input)
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)

  const uploaded = file ? await uploadAttachment(file) : null
  const { data, error } = await getSupabase()
    .from('transactions')
    .insert({ ...fromNewTransaction(input), ...attachmentColumns(uploaded) })
    .select(TRANSACTION_COLUMNS)
    .single()
  if (error) {
    if (uploaded) await removeAttachmentFile(uploaded.path)
    throw new Error(`Couldn't save the transaction: ${error.message}`)
  }
  return toTransaction(data as TransactionRow)
}

/**
 * Saves changes to a transaction. Totals need no update of their own, because
 * pnl_monthly and iras_summary add up the rows each time they're read.
 *
 * The order protects the row, which is the source of truth: upload the new file,
 * save the row, and only then remove the old file. Whatever fails partway, the
 * row never points at a file that isn't there.
 */
export async function updateTransaction(
  mode: Mode,
  current: Transaction,
  input: NewTransaction,
  change: AttachmentChange,
): Promise<Transaction> {
  validateTransaction(input)
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)

  const uploaded = change.kind === 'replace' ? await uploadAttachment(change.file) : null
  // .select() makes the update report which rows it changed, for the same reason
  // as in deleteTransaction below.
  const { data, error } = await getSupabase()
    .from('transactions')
    .update({
      ...fromNewTransaction(input),
      ...(change.kind === 'keep' ? {} : attachmentColumns(uploaded)),
    })
    .eq('id', current.id)
    .select(TRANSACTION_COLUMNS)
  if (error || !data?.length) {
    if (uploaded) await removeAttachmentFile(uploaded.path)
    throw new Error(
      error
        ? `Couldn't save your changes: ${error.message}`
        : "Couldn't save your changes: this transaction no longer exists. Reload the page.",
    )
  }
  if (change.kind !== 'keep' && current.attachment) await removeAttachmentFile(current.attachment.path)
  return toTransaction(data[0] as TransactionRow)
}

export async function deleteTransaction(mode: Mode, id: string): Promise<void> {
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)
  // .select() makes the delete report which rows it removed. Without it, an id
  // that no longer exists (or that RLS hides) "succeeds" while removing nothing.
  const { data, error } = await getSupabase()
    .from('transactions')
    .delete()
    .eq('id', id)
    .select('id, attachment_path')
  if (error) throw new Error(`Couldn't delete the transaction: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't delete the transaction: it no longer exists. Reload the page.")
  const path = (data[0] as { attachment_path: string | null }).attachment_path
  if (path) await removeAttachmentFile(path)
}

// ── Attachments ────────────────────────────────────────────────────────────────

// Some browsers report no type for HEIC photos, so fall back to the extension.
function attachmentContentType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type
  return TYPE_FOR_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

/** Why this file can't be attached, in words for the screen, or null if it can. */
export function validateAttachment(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!EXTENSION_FOR_TYPE[attachmentContentType(file)]) return 'Please choose a photo or a PDF.'
  if (file.size === 0) return 'That file is empty. Please choose another.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'That file is over 10 MB. Please choose a smaller one.'
  return null
}

async function uploadAttachment(file: File): Promise<TransactionAttachment> {
  const problem = validateAttachment(file)
  if (problem) throw new Error(problem)
  const contentType = attachmentContentType(file)
  const path = `${crypto.randomUUID()}.${EXTENSION_FOR_TYPE[contentType]}`
  const { error } = await getSupabase().storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (error) throw new Error(`Couldn't upload ${file.name}: ${error.message}`)
  return { path, name: file.name }
}

// Tidying up, so it never throws: by this point the outcome is already decided,
// and the worst a failure leaves behind is an unused file in a private bucket.
export async function removeAttachmentFile(path: string): Promise<void> {
  try {
    const { error } = await getSupabase().storage.from(ATTACHMENT_BUCKET).remove([path])
    if (error) console.warn(`Couldn't remove the unused file ${path}: ${error.message}`)
  } catch (err) {
    console.warn(`Couldn't remove the unused file ${path}:`, err)
  }
}

/** A link to the file that works for 5 minutes, because the bucket is private. */
export async function getAttachmentUrl(mode: Mode, attachment: TransactionAttachment): Promise<string> {
  if (mode === 'demo') throw new Error(DEMO_READ_ONLY)
  const { data, error } = await getSupabase().storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.path, 300)
  if (error) throw new Error(`Couldn't open ${attachment.name}: ${error.message}`)
  return data.signedUrl
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
