// All invoice data access lives here. Views call these functions and never see the
// Supabase client or the database's snake_case column names.
//   demo → an in-memory copy of the fixtures; no network. Drafts can be edited
//          for the session, but nothing can be issued or voided.
//   app  → the invoices tables and functions in 0006, guarded by RLS
//
// The invoice number, the issue date and the freezing of an issued invoice are
// all decided by the database (issue_invoice() in 0006), never here. The totals
// come from invoiceTotals.ts, and the database checks that they add up.

import { getSupabase } from './supabase'
import { amountPayable, buildTotalsRows, calcSubtotal } from './invoiceTotals'
import { DEMO_INVOICES, DEMO_INVOICE_SETTINGS } from './demoData'
import type {
  BusinessDetails, Invoice, InvoiceDraft, InvoiceKind, InvoiceLine, InvoiceSettings,
  InvoiceStatus, InvoiceTemplate, TotalsRow,
} from '../types'

type Mode = 'demo' | 'app'

const DEMO_NO_ISSUE = 'The demo can’t issue or void invoices. Sign in to issue real ones.'

// ── Demo store ─────────────────────────────────────────────────────────────────

// Lives until the page reloads; nothing is saved anywhere.
const demo = {
  invoices: DEMO_INVOICES.map(copyInvoice),
}

function copyInvoice(inv: Invoice): Invoice {
  return {
    ...inv,
    lines: inv.lines.map(l => ({ ...l })),
    totals: inv.totals?.map(r => ({ ...r })) ?? null,
    business: inv.business ? { ...inv.business } : null,
  }
}

// ── Row mapping ────────────────────────────────────────────────────────────────

// numeric columns: PostgREST may send them as strings to keep every digit.
type Numeric = number | string

interface LineRow {
  position: number
  title: string
  description: string | null
  quantity: number
  unit_amount: Numeric
}

interface InvoiceRow {
  id: string
  status: InvoiceStatus
  template: InvoiceTemplate
  kind: InvoiceKind
  client_id: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  pws_date: string | null
  wedding_date: string | null
  client_note: string | null
  terms: string | null
  deposit_invoice_id: string | null
  legacy_deposit_no: string | null
  replaces_invoice_id: string | null
  invoice_no: string | null
  issued_on: string | null
  subtotal: Numeric | null
  amount_payable: Numeric | null
  totals: unknown            // jsonb, narrowed by toTotals()
  business_snapshot: unknown // jsonb, narrowed by toBusiness()
  pdf_path: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
  invoice_line_items: LineRow[]
}

interface SettingsRow {
  business_name: string | null
  address: string | null
  email: string | null
  phone: string | null
  paynow: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_no: string | null
  default_terms_rental: string | null
  default_terms_bespoke: string | null
}

const INVOICE_COLUMNS = `
  id, status, template, kind, client_id, client_name, client_email, client_phone,
  pws_date, wedding_date, client_note, terms, deposit_invoice_id, legacy_deposit_no,
  replaces_invoice_id, invoice_no, issued_on, subtotal, amount_payable, totals,
  business_snapshot, pdf_path, voided_at, void_reason, created_at,
  invoice_line_items ( position, title, description, quantity, unit_amount )`

const SETTINGS_COLUMNS = `
  business_name, address, email, phone, paynow, bank_name, bank_account_name,
  bank_account_no, default_terms_rental, default_terms_bespoke`

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// The jsonb columns arrive as `unknown`. issue_invoice() only ever stores the
// shapes below, but they're checked here rather than trusted with a cast.
function toTotals(v: unknown): TotalsRow[] | null {
  if (!Array.isArray(v)) return null
  return v.filter(isRecord).map(r => ({
    label:  String(r.label ?? ''),
    amount: Number(r.amount ?? 0),
    bold:   r.bold === true,
  }))
}

function toBusiness(v: unknown): BusinessDetails | null {
  if (!isRecord(v)) return null
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : '')
  return {
    businessName:    text('businessName'),
    address:         text('address'),
    email:           text('email'),
    phone:           text('phone'),
    paynow:          text('paynow'),
    bankName:        text('bankName'),
    bankAccountName: text('bankAccountName'),
    bankAccountNo:   text('bankAccountNo'),
  }
}

function toInvoice(r: InvoiceRow): Invoice {
  return {
    id:                r.id,
    status:            r.status,
    template:          r.template,
    kind:              r.kind,
    clientId:          r.client_id ?? '',
    clientName:        r.client_name,
    clientEmail:       r.client_email ?? '',
    clientPhone:       r.client_phone ?? '',
    pwsDate:           r.pws_date ?? '',
    weddingDate:       r.wedding_date ?? '',
    clientNote:        r.client_note ?? '',
    terms:             r.terms ?? '',
    depositInvoiceId:  r.deposit_invoice_id ?? '',
    legacyDepositNo:   r.legacy_deposit_no ?? '',
    replacesInvoiceId: r.replaces_invoice_id ?? '',
    lines: [...r.invoice_line_items]
      .sort((a, b) => a.position - b.position)
      .map(l => ({
        title:       l.title,
        description: l.description ?? '',
        quantity:    l.quantity,
        unitAmount:  Number(l.unit_amount),
      })),
    invoiceNo:     r.invoice_no ?? '',
    issuedOn:      r.issued_on ?? '',
    subtotal:      r.subtotal === null ? null : Number(r.subtotal),
    amountPayable: r.amount_payable === null ? null : Number(r.amount_payable),
    totals:        toTotals(r.totals),
    business:      toBusiness(r.business_snapshot),
    pdfPath:       r.pdf_path ?? '',
    voidedAt:      r.voided_at ?? '',
    voidReason:    r.void_reason ?? '',
    createdAt:     r.created_at,
  }
}

// '' → null, the way the database stores "not set". save_invoice_draft() trims
// the text fields itself.
function fromDraft(d: InvoiceDraft) {
  return {
    template:            d.template,
    kind:                d.kind,
    client_id:           d.clientId || null,
    client_name:         d.clientName,
    client_email:        d.clientEmail,
    client_phone:        d.clientPhone,
    pws_date:            d.pwsDate || null,
    wedding_date:        d.weddingDate || null,
    client_note:         d.clientNote,
    terms:               d.terms,
    // Only a final can point at a deposit; the table's check constraint agrees.
    deposit_invoice_id:  d.kind === 'final' ? d.depositInvoiceId || null : null,
    legacy_deposit_no:   d.kind === 'final' && !d.depositInvoiceId ? d.legacyDepositNo : null,
    replaces_invoice_id: d.replacesInvoiceId || null,
  }
}

function fromLines(lines: InvoiceLine[]) {
  return lines.map(l => ({
    title:       l.title,
    description: l.description,
    quantity:    l.quantity,
    unit_amount: l.unitAmount,
  }))
}

function toSettings(r: SettingsRow): InvoiceSettings {
  return {
    businessName:        r.business_name ?? '',
    address:             r.address ?? '',
    email:               r.email ?? '',
    phone:               r.phone ?? '',
    paynow:              r.paynow ?? '',
    bankName:            r.bank_name ?? '',
    bankAccountName:     r.bank_account_name ?? '',
    bankAccountNo:       r.bank_account_no ?? '',
    defaultTermsRental:  r.default_terms_rental ?? '',
    defaultTermsBespoke: r.default_terms_bespoke ?? '',
  }
}

// ── Checks ─────────────────────────────────────────────────────────────────────

// What a draft needs before it can be saved at all: numbers the database will
// store without silently rounding.
function checkLines(lines: InvoiceLine[]): void {
  for (const [i, l] of lines.entries()) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new Error(`Line ${i + 1}: the quantity must be a whole number of at least 1.`)
    }
    if (!Number.isFinite(l.unitAmount) || l.unitAmount < 0) {
      throw new Error(`Line ${i + 1}: the amount can't be negative.`)
    }
    // The column keeps 2 decimal places and would silently round anything finer.
    if (Math.round(l.unitAmount * 100) / 100 !== l.unitAmount) {
      throw new Error(`Line ${i + 1}: amounts can have at most 2 decimal places.`)
    }
  }
}

/**
 * Why this draft can't be issued yet, or null if it can. issue_invoice() checks
 * the same things; checking here as well lets the view say so before asking.
 */
export function issueProblem(d: InvoiceDraft): string | null {
  if (!d.clientName.trim()) return 'Add the client’s name.'
  if (d.lines.length === 0) return 'Add at least one line item.'
  if (d.lines.some(l => !l.title.trim() || !(l.unitAmount > 0))) {
    return 'Every line item needs a title and an amount above zero.'
  }
  return null
}

/** The totals rows for a draft: what the preview shows and what issuing stores. */
export function draftTotals(d: Pick<InvoiceDraft, 'template' | 'kind' | 'lines'>): TotalsRow[] {
  return buildTotalsRows(d.template, d.kind, calcSubtotal(d.lines))
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/** Every invoice, newest first, each with its line items. */
export async function listInvoices(mode: Mode): Promise<Invoice[]> {
  if (mode === 'demo') {
    return demo.invoices.map(copyInvoice).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  const { data, error } = await getSupabase()
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Couldn't load invoices: ${error.message}`)
  return (data as InvoiceRow[]).map(toInvoice)
}

export async function getInvoice(mode: Mode, id: string): Promise<Invoice> {
  if (mode === 'demo') {
    const inv = demo.invoices.find(i => i.id === id)
    if (!inv) throw new Error('That invoice no longer exists.')
    return copyInvoice(inv)
  }
  const { data, error } = await getSupabase()
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Couldn't load the invoice: ${error.message}`)
  if (!data) throw new Error('That invoice no longer exists. Reload the page.')
  return toInvoice(data as InvoiceRow)
}

/** Business details and default terms. Owner-edited data, not code. */
export async function getInvoiceSettings(mode: Mode): Promise<InvoiceSettings> {
  if (mode === 'demo') return { ...DEMO_INVOICE_SETTINGS }
  const { data, error } = await getSupabase()
    .from('invoice_settings')
    .select(SETTINGS_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`Couldn't load the invoice settings: ${error.message}`)
  if (!data) throw new Error('The invoice settings are missing. Check that migration 0006 is applied.')
  return toSettings(data as SettingsRow)
}

// ── Drafts ─────────────────────────────────────────────────────────────────────

export function defaultTerms(settings: InvoiceSettings, template: InvoiceTemplate): string {
  return template === 'rental' ? settings.defaultTermsRental : settings.defaultTermsBespoke
}

/** A blank draft, starting from the template's default terms. */
export function blankDraft(settings: InvoiceSettings, template: InvoiceTemplate = 'rental'): InvoiceDraft {
  return {
    template,
    kind: 'deposit',
    clientId: '', clientName: '', clientEmail: '', clientPhone: '',
    pwsDate: '', weddingDate: '',
    clientNote: '',
    terms: defaultTerms(settings, template),
    depositInvoiceId: '', legacyDepositNo: '', replacesInvoiceId: '',
    lines: [{ title: '', description: '', quantity: 1, unitAmount: 0 }],
  }
}

/** The editable part of an invoice. */
export function toDraft(inv: Invoice): InvoiceDraft {
  return {
    template:          inv.template,
    kind:              inv.kind,
    clientId:          inv.clientId,
    clientName:        inv.clientName,
    clientEmail:       inv.clientEmail,
    clientPhone:       inv.clientPhone,
    pwsDate:           inv.pwsDate,
    weddingDate:       inv.weddingDate,
    clientNote:        inv.clientNote,
    terms:             inv.terms,
    depositInvoiceId:  inv.depositInvoiceId,
    legacyDepositNo:   inv.legacyDepositNo,
    replacesInvoiceId: inv.replacesInvoiceId,
    lines:             inv.lines.map(l => ({ ...l })),
  }
}

/**
 * A final invoice drafted from an issued deposit: same client, template, dates
 * and lines, linked to the deposit by id. Keeps the draft's own terms and note.
 */
export function finalFromDeposit(current: InvoiceDraft, deposit: Invoice): InvoiceDraft {
  return {
    ...current,
    template:         deposit.template,
    kind:             'final',
    clientId:         deposit.clientId,
    clientName:       deposit.clientName,
    clientEmail:      deposit.clientEmail,
    clientPhone:      deposit.clientPhone,
    pwsDate:          deposit.pwsDate,
    weddingDate:      deposit.weddingDate,
    depositInvoiceId: deposit.id,
    legacyDepositNo:  '',
    lines:            deposit.lines.map(l => ({ ...l })),
  }
}

/**
 * Saves a draft and all its lines in one go (save_invoice_draft() in 0006).
 * id null creates a new draft. Returns the saved invoice.
 */
export async function saveDraft(mode: Mode, id: string | null, draft: InvoiceDraft): Promise<Invoice> {
  checkLines(draft.lines)
  if (mode === 'demo') {
    const existing = id ? demo.invoices.find(i => i.id === id) : undefined
    if (id && existing?.status !== 'draft') throw new Error('Only a draft can be edited.')
    const saved: Invoice = {
      ...(existing ?? {
        id: crypto.randomUUID(), status: 'draft', invoiceNo: '', issuedOn: '', subtotal: null,
        amountPayable: null, totals: null, business: null, pdfPath: '', voidedAt: '', voidReason: '',
        createdAt: new Date().toISOString(),
      }),
      ...draft,
      lines: draft.lines.map(l => ({ ...l })),
    }
    demo.invoices = [...demo.invoices.filter(i => i.id !== saved.id), saved]
    return copyInvoice(saved)
  }

  const { data, error } = await getSupabase().rpc('save_invoice_draft', {
    p_id: id,
    p_invoice: fromDraft(draft),
    p_lines: fromLines(draft.lines),
  })
  if (error) throw new Error(`Couldn't save the draft: ${error.message}`)
  return getInvoice(mode, data as string)
}

export async function deleteDraft(mode: Mode, id: string): Promise<void> {
  if (mode === 'demo') {
    demo.invoices = demo.invoices.filter(i => !(i.id === id && i.status === 'draft'))
    return
  }
  // RLS only lets drafts be deleted. .select() makes the delete report what it
  // removed, so an issued invoice (or a vanished one) fails loudly instead of
  // "succeeding" while removing nothing.
  const { data, error } = await getSupabase()
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
  if (error) throw new Error(`Couldn't delete the draft: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't delete the draft: it no longer exists or has been issued. Reload the page.")
}

/**
 * A new draft that copies an issued invoice and will replace it. The original
 * stays valid until the replacement is issued, which voids it in the same step.
 */
export async function startReplacement(mode: Mode, original: Invoice): Promise<Invoice> {
  if (original.status !== 'issued') throw new Error('Only an issued invoice can be replaced.')
  return saveDraft(mode, null, { ...toDraft(original), replacesInvoiceId: original.id })
}

// ── Issuing and voiding ────────────────────────────────────────────────────────

/**
 * Issues a saved draft: the database assigns the next number and today's date in
 * Singapore, stores these totals and freezes the invoice. Save the draft first;
 * the database checks the totals against the lines it has stored.
 */
export async function issueInvoice(mode: Mode, draft: Invoice): Promise<Invoice> {
  const problem = issueProblem(draft)
  if (problem) throw new Error(problem)
  if (mode === 'demo') throw new Error(DEMO_NO_ISSUE)

  const totals = draftTotals(draft)
  const { error } = await getSupabase().rpc('issue_invoice', {
    p_id: draft.id,
    p_subtotal: calcSubtotal(draft.lines),
    p_totals: totals,
  })
  // Never swallowed: if this fails, no number was used (the database rolls the
  // counter back), and the message says why.
  if (error) throw new Error(`Couldn't issue the invoice: ${error.message}`)
  return getInvoice(mode, draft.id)
}

/** Voids an issued invoice that won't be replaced, e.g. a cancelled booking. */
export async function voidInvoice(mode: Mode, id: string, reason: string): Promise<Invoice> {
  if (mode === 'demo') throw new Error(DEMO_NO_ISSUE)
  const { error } = await getSupabase().rpc('void_invoice', { p_id: id, p_reason: reason })
  if (error) throw new Error(`Couldn't void the invoice: ${error.message}`)
  return getInvoice(mode, id)
}

// ── Relationships between invoices ────────────────────────────────────────────

/** Issued deposits that no issued final settles yet, newest first. */
export function depositsAwaitingFinal(invoices: Invoice[]): Invoice[] {
  const settled = new Set(
    invoices.filter(i => i.kind === 'final' && i.status === 'issued').map(i => i.depositInvoiceId),
  )
  return invoices.filter(i => i.kind === 'deposit' && i.status === 'issued' && !settled.has(i.id))
}

/** The invoice that replaced this one (issued) or will replace it (draft), if any. */
export function replacementOf(invoices: Invoice[], id: string): Invoice | undefined {
  return invoices.find(i => i.replacesInvoiceId === id)
}

/** What the amount payable is or will be: stored once issued, computed for a draft. */
export function payableOf(inv: Invoice): number {
  return inv.amountPayable ?? amountPayable(draftTotals(inv))
}
