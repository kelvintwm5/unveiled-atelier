// Builds the InvoiceRender that the PDF is drawn from. Pure, so the rule "an
// issued invoice prints only what was frozen when it was issued" can be tested.

import { buildTotalsRows, calcSubtotal } from './invoiceTotals'
import type { BusinessDetails, Invoice, InvoiceDraft, InvoiceRender, InvoiceSettings } from '../types'

function businessOf(s: InvoiceSettings): BusinessDetails {
  return {
    businessName:    s.businessName,
    address:         s.address,
    email:           s.email,
    phone:           s.phone,
    paynow:          s.paynow,
    bankName:        s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNo:   s.bankAccountNo,
  }
}

function numberOf(invoices: Invoice[], id: string): string {
  return id ? invoices.find(i => i.id === id)?.invoiceNo ?? '' : ''
}

function common(d: InvoiceDraft, invoices: Invoice[]) {
  return {
    template:    d.template,
    kind:        d.kind,
    clientName:  d.clientName.trim(),
    clientEmail: d.clientEmail.trim(),
    clientPhone: d.clientPhone.trim(),
    pwsDate:     d.pwsDate,
    weddingDate: d.weddingDate,
    clientNote:  d.clientNote,
    lines:       d.lines.map(l => ({ ...l })),
    terms:       d.terms,
    settles:     numberOf(invoices, d.depositInvoiceId) || d.legacyDepositNo.trim(),
    replaces:    numberOf(invoices, d.replacesInvoiceId),
  }
}

/** A draft as it would print today, with the current business details. */
export function renderFromDraft(
  draft: InvoiceDraft,
  settings: InvoiceSettings,
  today: string,
  invoices: Invoice[],
): InvoiceRender {
  return {
    ...common(draft, invoices),
    invoiceNo: '',
    date:      today,
    business:  businessOf(settings),
    totals:    buildTotalsRows(draft.template, draft.kind, calcSubtotal(draft.lines)),
  }
}

/**
 * An issued (or void) invoice exactly as it was sent: its stored totals and the
 * business details copied at issue, never today's settings or today's rules.
 */
export function renderFromIssued(inv: Invoice, invoices: Invoice[]): InvoiceRender {
  if (inv.status === 'draft' || !inv.totals || !inv.business) {
    throw new Error(`Invoice ${inv.invoiceNo || '(draft)'} has no issued record to print from.`)
  }
  return {
    ...common(inv, invoices),
    invoiceNo: inv.invoiceNo,
    date:      inv.issuedOn,
    business:  { ...inv.business },
    totals:    inv.totals.map(r => ({ ...r })),
  }
}
