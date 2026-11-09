// All invoice data access lives here. Views call these functions and never see the
// Supabase client or the database's snake_case column names.
//   demo → an in-memory copy of the fixtures; no network. Drafts and settings
//          can be edited for the session, but nothing can be issued or voided,
//          and PDFs are made in the browser without being stored.
//   app  → the invoices tables and functions in 0006 and 0009, guarded by RLS
//
// The invoice number, the issue date and the freezing of an issued invoice are
// all decided by the database (issue_invoice() in 0009), never here. The totals
// come from invoiceTotals.ts, and the database checks that they add up.

import { getSupabase } from './supabase'
import { adjustmentsForReissue, amountPayable, buildTotalsRows, calcSubtotal } from './invoiceTotals'
import { DEMO_INVOICES, DEMO_INVOICE_SETTINGS, DEMO_SERVICES } from './demoData'
import { renderFromIssued } from './invoiceRender'
import { renderInvoicePdf } from './invoicePdf'
import type {
  BusinessDetails, Invoice, InvoiceAdjustment, InvoiceDraft, InvoiceKind, InvoiceLine,
  InvoiceService, InvoiceSettings, InvoiceStatus, InvoiceTemplate, NewInvoiceService,
  TotalsRow,
} from '../types'

type Mode = 'demo' | 'app'

const DEMO_NO_ISSUE = 'The demo can’t issue or void invoices. Sign in to issue real ones.'

// ── Demo store ─────────────────────────────────────────────────────────────────

// Lives until the page reloads; nothing is saved anywhere.
const demo = {
  invoices: DEMO_INVOICES.map(copyInvoice),
  settings: { ...DEMO_INVOICE_SETTINGS },
  services: DEMO_SERVICES.map(s => ({ ...s })),
}

// The private Storage bucket from 0006. Each issued invoice's PDF is stored
// once, as <invoice number>.pdf, and can't be overwritten.
const PDF_BUCKET = 'invoices'

function copyInvoice(inv: Invoice): Invoice {
  return {
    ...inv,
    lines: inv.lines.map(l => ({ ...l })),
    adjustments: inv.adjustments.map(a => ({ ...a })),
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
  line_type: 'service' | 'add' | 'deduct'
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
  invoice_line_items ( position, title, description, quantity, unit_amount, line_type )`

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
    ...(r.memo === true ? { memo: true } : {}),
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
  // The database keeps service lines and payment rows in one table. The rest of
  // the app treats them as the two different things they are.
  const rows = [...r.invoice_line_items].sort((a, b) => a.position - b.position)
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
    lines: rows.filter(l => l.line_type === 'service').map(l => ({
      title:       l.title,
      description: l.description ?? '',
      quantity:    l.quantity,
      unitAmount:  Number(l.unit_amount),
    })),
    adjustments: rows.filter(l => l.line_type !== 'service').map(l => ({
      label:     l.title,
      direction: l.line_type === 'deduct' ? 'deduct' : 'add',
      amount:    Number(l.unit_amount),
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

// Service lines first, then payment rows: their order in the list is their
// position in the table.
function fromLines(lines: InvoiceLine[], adjustments: InvoiceAdjustment[]) {
  return [
    ...lines.map(l => ({
      title:       l.title,
      description: l.description,
      quantity:    l.quantity,
      unit_amount: l.unitAmount,
      line_type:   'service',
    })),
    ...adjustments.map(a => ({
      title:       a.label,
      description: '',
      quantity:    1,
      unit_amount: a.amount,
      line_type:   a.direction,
    })),
  ]
}

function fromSettings(st: InvoiceSettings): SettingsRow {
  const text = (v: string) => v.trim() || null
  return {
    business_name:         text(st.businessName),
    address:               text(st.address),
    email:                 text(st.email),
    phone:                 text(st.phone),
    paynow:                text(st.paynow),
    bank_name:             text(st.bankName),
    bank_account_name:     text(st.bankAccountName),
    bank_account_no:       text(st.bankAccountNo),
    default_terms_rental:  text(st.defaultTermsRental),
    default_terms_bespoke: text(st.defaultTermsBespoke),
  }
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
function checkAmounts(lines: InvoiceLine[], adjustments: InvoiceAdjustment[]): void {
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
  for (const [i, a] of adjustments.entries()) {
    if (!Number.isFinite(a.amount) || a.amount < 0) {
      throw new Error(`Payment row ${i + 1}: the amount can't be negative.`)
    }
    if (Math.round(a.amount * 100) / 100 !== a.amount) {
      throw new Error(`Payment row ${i + 1}: amounts can have at most 2 decimal places.`)
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
  if (d.adjustments.some(a => !a.label.trim() || !(a.amount > 0))) {
    return 'Every charge or discount needs a description and an amount above zero.'
  }
  if (amountPayable(draftTotals(d)) <= 0) return 'The amount payable must be above zero.'
  return null
}

/** The totals rows for a draft: what the preview shows and what issuing stores. */
export function draftTotals(d: Pick<InvoiceDraft, 'lines' | 'adjustments'>): TotalsRow[] {
  return buildTotalsRows(calcSubtotal(d.lines), d.adjustments)
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
  if (mode === 'demo') return { ...demo.settings }
  const { data, error } = await getSupabase()
    .from('invoice_settings')
    .select(SETTINGS_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`Couldn't load the invoice settings: ${error.message}`)
  if (!data) throw new Error('The invoice settings are missing. Check that migration 0006 is applied.')
  return toSettings(data as SettingsRow)
}

/**
 * Saves the business details and default terms. Invoices already issued keep
 * the details they were issued with; drafts pick up the new ones.
 */
export async function updateInvoiceSettings(mode: Mode, settings: InvoiceSettings): Promise<InvoiceSettings> {
  if (mode === 'demo') {
    demo.settings = { ...settings }
    return { ...demo.settings }
  }
  // The table holds exactly one row, whose id is true.
  const { data, error } = await getSupabase()
    .from('invoice_settings')
    .update(fromSettings(settings))
    .eq('id', true)
    .select(SETTINGS_COLUMNS)
  if (error) throw new Error(`Couldn't save the settings: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't save the settings: the settings row is missing. Check that migration 0006 is applied.")
  return toSettings(data[0] as SettingsRow)
}

// ── Service library ────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  title: string
  description: string | null
  default_amount: Numeric | null
}

const SERVICE_COLUMNS = 'id, title, description, default_amount'

function toService(r: ServiceRow): InvoiceService {
  return {
    id:            r.id,
    title:         r.title,
    description:   r.description ?? '',
    defaultAmount: r.default_amount === null ? null : Number(r.default_amount),
  }
}

/** The saved services, in the order they were added. */
export async function listServices(mode: Mode): Promise<InvoiceService[]> {
  if (mode === 'demo') return demo.services.map(s => ({ ...s }))
  const { data, error } = await getSupabase()
    .from('invoice_services')
    .select(SERVICE_COLUMNS)
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(`Couldn't load the saved services: ${error.message}`)
  return (data as ServiceRow[]).map(toService)
}

/** Adds a service (id null) or changes one. Invoices that already use it keep their copy. */
export async function saveService(mode: Mode, id: string | null, input: NewInvoiceService): Promise<InvoiceService> {
  const title = input.title.trim()
  const description = input.description.replace(/\s+$/, '')
  const defaultAmount = input.defaultAmount
  if (!title) throw new Error('Give the service a title.')
  if (defaultAmount !== null) {
    if (!Number.isFinite(defaultAmount) || defaultAmount <= 0) {
      throw new Error('The standard price must be above zero, or left empty.')
    }
    if (Math.round(defaultAmount * 100) / 100 !== defaultAmount) {
      throw new Error('The standard price can have at most 2 decimal places.')
    }
  }

  if (mode === 'demo') {
    const service = { id: id ?? crypto.randomUUID(), title, description, defaultAmount }
    demo.services = id ? demo.services.map(s => (s.id === id ? service : s)) : [...demo.services, service]
    return { ...service }
  }

  const row = { title, description: description || null, default_amount: defaultAmount }
  const query = id
    ? getSupabase().from('invoice_services').update(row).eq('id', id)
    : getSupabase().from('invoice_services').insert(row)
  // .select() makes an update report which row it changed, so a service deleted
  // on another device fails loudly instead of "saving" nothing.
  const { data, error } = await query.select(SERVICE_COLUMNS)
  if (error) throw new Error(`Couldn't save the service: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't save the service: it no longer exists. Reload the page.")
  return toService(data[0] as ServiceRow)
}

export async function deleteService(mode: Mode, id: string): Promise<void> {
  if (mode === 'demo') {
    demo.services = demo.services.filter(s => s.id !== id)
    return
  }
  const { data, error } = await getSupabase()
    .from('invoice_services')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw new Error(`Couldn't delete the service: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't delete the service: it no longer exists. Reload the page.")
}

// ── Drafts ─────────────────────────────────────────────────────────────────────

export function defaultTerms(settings: InvoiceSettings, template: InvoiceTemplate): string {
  return template === 'rental' ? settings.defaultTermsRental : settings.defaultTermsBespoke
}

/** A blank draft, starting from the template's default terms. */
export function blankDraft(settings: InvoiceSettings, template: InvoiceTemplate = 'rental'): InvoiceDraft {
  return {
    template,
    kind: 'full',
    clientId: '', clientName: '', clientEmail: '', clientPhone: '',
    pwsDate: '', weddingDate: '',
    clientNote: '',
    terms: defaultTerms(settings, template),
    depositInvoiceId: '', legacyDepositNo: '', replacesInvoiceId: '',
    lines: [{ title: '', description: '', quantity: 1, unitAmount: 0 }],
    adjustments: [],
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
    adjustments:       inv.adjustments.map(a => ({ ...a })),
  }
}

/**
 * Saves a draft and all its lines in one go (save_invoice_draft() in 0006).
 * id null creates a new draft. Returns the saved invoice.
 */
export async function saveDraft(mode: Mode, id: string | null, draft: InvoiceDraft): Promise<Invoice> {
  checkAmounts(draft.lines, draft.adjustments)
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
      adjustments: draft.adjustments.map(a => ({ ...a })),
    }
    demo.invoices = [...demo.invoices.filter(i => i.id !== saved.id), saved]
    return copyInvoice(saved)
  }

  const { data, error } = await getSupabase().rpc('save_invoice_draft', {
    p_id: id,
    p_invoice: fromDraft(draft),
    p_lines: fromLines(draft.lines, draft.adjustments),
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
  return saveDraft(mode, null, {
    ...toDraft(original),
    adjustments: adjustmentsForReissue(original),
    replacesInvoiceId: original.id,
  })
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

// ── Issued PDFs ────────────────────────────────────────────────────────────────

/**
 * Makes the PDF of an issued invoice from its frozen record, stores it in the
 * bucket and records where. Called straight after issuing, and again by
 * "Save PDF" if that first attempt failed. Safe to repeat: a file that already
 * made it to Storage is kept, never replaced.
 */
export async function storeIssuedPdf(mode: Mode, inv: Invoice, invoices: Invoice[]): Promise<Invoice> {
  if (mode === 'demo') throw new Error(DEMO_NO_ISSUE)
  if (inv.pdfPath) return inv

  const blob = await renderInvoicePdf(renderFromIssued(inv, invoices))
  const path = `${inv.invoiceNo}.pdf`
  const { error: uploadError } = await getSupabase().storage
    .from(PDF_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: false })
  // "Already exists" means an earlier attempt uploaded the file but didn't get
  // as far as recording it. That file was made from the same frozen record, so
  // record it rather than fail.
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) {
    throw new Error(`Couldn't store the PDF for ${inv.invoiceNo}: ${uploadError.message}`)
  }
  const { error } = await getSupabase().rpc('attach_invoice_pdf', { p_id: inv.id, p_path: path })
  if (error) throw new Error(`Couldn't record the PDF for ${inv.invoiceNo}: ${error.message}`)
  return getInvoice(mode, inv.id)
}

/**
 * The PDF of an issued invoice, to open or share. The stored file when there is
 * one (a link that works for 5 minutes, because the bucket is private);
 * otherwise, as in demo mode, one made from the frozen record.
 */
export async function getIssuedPdf(mode: Mode, inv: Invoice, invoices: Invoice[]): Promise<Blob | string> {
  if (mode === 'app' && inv.pdfPath) {
    const { data, error } = await getSupabase().storage
      .from(PDF_BUCKET)
      .createSignedUrl(inv.pdfPath, 300)
    if (error) throw new Error(`Couldn't open the PDF for ${inv.invoiceNo}: ${error.message}`)
    return data.signedUrl
  }
  return renderInvoicePdf(renderFromIssued(inv, invoices))
}

// ── Relationships between invoices ────────────────────────────────────────────

/** The invoice that replaced this one (issued) or will replace it (draft), if any. */
export function replacementOf(invoices: Invoice[], id: string): Invoice | undefined {
  return invoices.find(i => i.replacesInvoiceId === id)
}

/** What the amount payable is or will be: stored once issued, computed for a draft. */
export function payableOf(inv: Invoice): number {
  return inv.amountPayable ?? amountPayable(draftTotals(inv))
}
